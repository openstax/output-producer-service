#!/bin/bash

exec 2> >(tee "${ASSEMBLED_OUTPUT}/stderr" >&2)

shopt -s globstar nullglob
for collection in "${RAW_COLLECTION_DIR}/collections/"*; do
    slug_name=$(basename "$collection" | awk -F'[.]' '{ print $1; }')
    if [[ -n "${TARGET_BOOK}" ]]; then
        if [[ "$slug_name" != "${TARGET_BOOK}" ]]; then
            continue
        fi
    fi
    mv "$collection" "${RAW_COLLECTION_DIR}/modules/collection.xml"
    mv "${RAW_COLLECTION_DIR}/metadata/$slug_name.metadata.json" "${RAW_COLLECTION_DIR}/modules/metadata.json"

    neb assemble "${RAW_COLLECTION_DIR}/modules" temp-assembly/

    cp "temp-assembly/collection.assembled.xhtml" "${ASSEMBLED_OUTPUT}/$slug_name.assembled.xhtml"
    rm -rf temp-assembly
done
shopt -u globstar nullglob
