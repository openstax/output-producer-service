import os
import io
import re
import sys
import requests
import base64
import hashlib
import struct
from lxml import etree
from pathlib import Path

DENSITY_DPI = 900
IMG_SNIPPET = '<img src="{}" alt="{}" width="{}" height="{}" />'
JSONRPC_URL = 'http://127.0.0.1:33001/jsonrpc'


def force_math_namespace_only(doc):
    '''remove special namespaces from MathML in XHTML'''
    # http://wiki.tei-c.org/index.php/Remove-Namespaces.xsl
    xslt = u'''<xsl:stylesheet
      version="1.0"
      xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
      xmlns="http://www.w3.org/1998/Math/MathML">
    <xsl:output method="xml" indent="no"/>

    <xsl:template match="/|comment()|processing-instruction()">
        <xsl:copy>
          <xsl:apply-templates/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="*">
        <xsl:element name="{local-name()}">
          <xsl:apply-templates select="@*|node()"/>
        </xsl:element>
    </xsl:template>

    <xsl:template match="@*">
        <xsl:attribute name="{local-name()}">
          <xsl:value-of select="."/>
        </xsl:attribute>
    </xsl:template>
    </xsl:stylesheet>
    '''
    xslt_doc = etree.parse(io.StringIO(xslt))
    transform = etree.XSLT(xslt_doc)
    doc = transform(doc)
    return doc


def strip_mathjax_container(svg):
    '''remove MJX container from svg generated by MathJax'''
    xslt = u'''<xsl:stylesheet
      version="1.0"
      xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
      xmlns="http://www.w3.org/1998/Math/MathML">
    <xsl:output method="xml" indent="no"/>

    <xsl:template match="mjx-container">
        <xsl:apply-templates/>
    </xsl:template>

    <xsl:template match="@*|node()">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
    </xsl:template>

    </xsl:stylesheet>
    '''
    xslt_doc = etree.parse(io.StringIO(xslt))
    svg_xml = etree.parse(io.StringIO(svg))
    transform = etree.XSLT(xslt_doc)
    svg_xml = transform(svg_xml)
    bytes_svg = etree.tostring(svg_xml, with_tail=False)
    pure_svg = str(bytes_svg, 'utf-8')
    return pure_svg


def get_png_dimensions(png_bytes):
    '''read PNG image dimensions directly from PNG bytes'''
    check = struct.unpack('>i', png_bytes[4:8])[0]
    if check != 0x0d0a1a0a:
        return 0, 0
    width, height = struct.unpack('>ii', png_bytes[16:24])
    return width, height


def patch_mathjax_svg_invalid_xml(svg):
    '''MathJax 3.1.5 can produce on corner cases invalid XML SVGs
       Details: https://github.com/openstax/cnx/issues/1291'''
    try:
        etree.parse(io.StringIO(svg))
        return svg  # no patch necessary
    except etree.XMLSyntaxError:
        patched_svg = re.sub(
            r'(data-semantic-operator=\"\S*)<(\S*\")', r'\1&lt;\2', svg)
        try:
            etree.parse(io.StringIO(patched_svg))
            return patched_svg
        except etree.XMLSyntaxError:
            raise Exception(
                    'Failed to generate valid XML out of SVG: ' + svg)


def mathml2svg_jsonrpc(equation):
    '''convert MathML to SVG with MathJax in Node'''
    payload = {
        "method": "mathml2svg",
        "params": [equation],
        "jsonrpc": "2.0",
        "id": 0,
    }

    response = requests.post(JSONRPC_URL, json=payload).json()

    if 'result' in response:
        svg = response['result'][0]
        mathspeak = response['result'][1]
        if len(svg) > 0:
            svg = patch_mathjax_svg_invalid_xml(svg)
            svg = strip_mathjax_container(svg)
        return svg, mathspeak
    else:
        # something went terrible wrong with calling
        # the jsonrpc server and running the command
        raise Exception(
            'No result in calling mml2svg2png jayson/json-rpc server!')
        return '', ''


def svg2png_jsonrpc(svg):
    '''convert SVG to PNG with sharp (node)'''
    payload = {
        "method": "svg2png",
        "params": [svg],
        "jsonrpc": "2.0",
        "id": 0,
    }

    response = requests.post(JSONRPC_URL, json=payload).json()

    if 'result' in response:
        png_base64 = response['result']
        png_bytes = b''
        if len(png_base64) > 0:
            png_bytes = base64.b64decode(png_base64)
        return png_bytes
    else:
        # something went terrible wrong with calling
        # the jsonrpc server and running the command
        raise Exception(
            'No result in calling mml2svg2png jayson/json-rpc server!')
        return ''


def main():
    '''main function
    1. Argument: XHTML file with MathML mtable equations
    2. Argument: resource folder
    3. Argument: destination XHTML file with MathML->PNG converted images
    '''
    xhtml_file = str(Path(sys.argv[1]).resolve(strict=True))
    resources_dir = str(Path(sys.argv[2]).resolve(strict=True))
    result_xhtml_file = sys.argv[3]
    if sys.version_info[0] < 3:
        raise Exception("Must be using Python 3")
    xhtml = etree.parse(xhtml_file)
    ns = {"h": "http://www.w3.org/1999/xhtml",
          "m": "http://www.w3.org/1998/Math/MathML"}

    for math_node in xhtml.xpath(
            '//h:math[descendant::h:mtable]|//m:math[descendant::m:mtable]',
            namespaces=ns):
        math_etree = force_math_namespace_only(math_node)
        bytes_equation = etree.tostring(
            math_etree, with_tail=False, inclusive_ns_prefixes=None)
        # convert bytes string from lxml to utf-8
        equation = str(bytes_equation, 'utf-8')
        svg, mathspeak = mathml2svg_jsonrpc(equation)

        # do not replace if conversion failed
        if svg:
            png = svg2png_jsonrpc(svg)
            if png:
                png_width, png_height = get_png_dimensions(png)
                if png_width > 0 and png_height > 0:
                    sha1 = hashlib.sha1(png)
                    png_filename = os.path.join(resources_dir,
                                                sha1.hexdigest())
                    # Note: Assumption is that ../resources/xyz
                    # is the relative path to all resources of the XHTML.
                    relative_resource_filename = '../resources/' + \
                        os.path.basename(png_filename)
                    png_file = open(png_filename, 'wb')
                    png_file.write(png)
                    png_file.close()
                    display_width = round(png_width / (DENSITY_DPI / 75 - 1))
                    display_height = round(png_height / (DENSITY_DPI / 75 - 1))
                    img_xhtml = IMG_SNIPPET.format(
                        relative_resource_filename, mathspeak,
                        display_width, display_height)
                    img_formatted = etree.fromstring(img_xhtml)
                    # replace MathML with img tag
                    math_node.getparent().replace(math_node, img_formatted)
                else:
                    raise Exception(
                        'Failed to get PNG image dimensions of equation'
                        + equation)
            else:
                raise Exception(
                    'Failed to generate PNG from SVG of equation: ' + equation)
        else:
            raise Exception(
                'Failed to generate SVG from MathML of equation: ' + equation)

    with open(result_xhtml_file, 'wb') as out:
        out.write(etree.tostring(xhtml, encoding='utf8', pretty_print=False))


if __name__ == "__main__":
    main()
