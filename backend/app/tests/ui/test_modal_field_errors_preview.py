import pytest

from pages.home import Home


@pytest.mark.smoke
@pytest.mark.ui
@pytest.mark.nondestructive
def test_invalid_colid_error_preview(selenium, base_url):
    # GIVEN: Selenium driver and the base url

    # WHEN: The Home page is fully loaded
    home = Home(selenium, base_url).open()

    # AND: The create a new job button is clicked
    modal = home.click_create_new_job_button()

    # AND: Clicks the Web Preview button
    modal.click_web_preview_radio_button()

    # AND: Incorrect collection id is typed into the collection id field
    modal.fill_collection_id_field("1col11229")

    # AND: Create button is clicked
    modal.click_create_button()

    split_col_id_incorrect = modal.collection_id_incorrect_field_error.text.splitlines()
    text_col_id_incorrect = split_col_id_incorrect[1]

    # THEN: Correct error message appears in collection id field
    assert "A valid collection ID is required, e.g. col12345" == text_col_id_incorrect

    split_style = modal.style_field_error.text.splitlines()
    text_style = split_style[1]
    assert "Style is required" == text_style

    split_server = modal.content_server_field_error.text.splitlines()
    text_server = split_server[1]
    assert "Please select a server" == text_server

    # THEN: The modal does not close and remains open
    assert home.create_job_modal_is_open

    # WHEN: modal is open and collection id has incorrect colid/slug
    # AND: Web preview (git) button is clicked
    modal.click_web_preview_git_radio_button()

    # AND: Create button is clicked when data fields are empty and collection ID field has incorrect colid
    modal.click_create_button()

    split_col_id_slug_incorrect = (
        modal.collection_id_slug_incorrect_field_error.text.splitlines()
    )
    text_col_id_slug_incorrect = split_col_id_slug_incorrect[1]

    # THEN: Correct error message appears in collection id and style field
    assert "A valid repo and slug name is required, e.g. repo-name/slug-name" == text_col_id_slug_incorrect

    split_style = modal.style_field_error.text.splitlines()
    text_style = split_style[1]
    assert "Style is required" == text_style

    # THEN: No error message appears for Content Server as it is disabled for web preview git
    split_server = modal.content_server_field_error.text.splitlines()
    assert "Please select a server" not in split_server
