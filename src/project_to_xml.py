# project_to_xml.py

import os
import argparse
import xml.etree.ElementTree as ET
import re

try:
    import pathspec
except ImportError:
    print("Error: 'pathspec' library not found. Please install it using: pip install pathspec")
    exit(1)

# --- Configuration & Header (Unchanged) ---
ROOT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILENAME = 'project_output.txt'
UPDATE_FILENAME = 'update.txt'
CUSTOM_IGNORE_FILENAME = '.project_ignore'
HEADER_TEXT = """You are a highly skilled coding assistant, that read understand each code line by line with an XML parsing tool that can modify and create files. When providing coding solutions, follow these precise rules:

When modifying existing code:

Provide the COMPLETE code of changed files within XML tags.
Use format: <file path="/path/to/file">...content...</file>
Never include files you haven't modified.
When creating new files:

Specify the path and filename.
Include complete file content in XML tags.
Use format: <file path="/path/to/newfile.ext">...content...</file>
When deleting files:

Use the delete attribute.
Format: <file path="/path/to/file" delete="true" />
Crucially, all file content MUST be wrapped in <![CDATA[...]]> sections to handle special characters correctly.

For explanations and discussions:

Use plain text outside XML tags.
Be concise and clear.
u need to create or overwrite a file called update.txt, u should only interact with this update.txt only, it is highly forbidden to access other files, except the given files. you can write only update.txt

Your responses must follow this XML structure:

<project>
  <file path="/path/to/file1"><![CDATA[
    file 1 full content
  ]]></file>
  <file path="/path/to/file2"><![CDATA[
    file 2 full content
  ]]></file>
  <file path="/file/to/delete" delete="true" />
</project>
I will provide code within this XML format for you to assist with below.
"""


def clean_content(content: str) -> str:
    # This function is unchanged but is essential
    pattern_func = re.compile(r"(alert|setSaveStatus|setFileError)\(([^`'\"].*?\${.*?})\);")
    content = pattern_func.sub(r'\1(`\2`);', content)
    pattern_assign = re.compile(r"(content\s*=\s*)([^`'\"].*?\${.*?});")
    content = pattern_assign.sub(r'\1`\2`;', content)
    lines_to_remove = { 'Generated code', 'IGNORE_WHEN_COPYING_START', 'content_copy', 'download', 'Use code with caution.', 'IGNORE_WHEN_COPYING_END' }
    lines = content.splitlines()
    cleaned_lines = [line for line in lines if line.strip() not in lines_to_remove]
    return "\n".join(cleaned_lines)


def update_project_from_xml(root_dir, input_txt_path):
    """
    Reads a .txt file, extracts and cleans the XML, and applies changes.
    """
    if not os.path.exists(input_txt_path):
        print(f"❌ Error: The update file '{input_txt_path}' was not found.")
        return

    print("--- UPDATE MODE ---")
    print(f"Applying changes from '{input_txt_path}'...")
    try:
        with open(input_txt_path, 'r', encoding='utf-8') as f:
            full_content = f.read()
        start_tag = '<project>'
        end_tag = '</project>'
        start_index = full_content.find(start_tag)
        end_index = full_content.rfind(end_tag)
        if start_index == -1 or end_index == -1:
            print(f"❌ Error: Could not find the <project>...</project> block in '{input_txt_path}'.")
            return
        xml_string = full_content[start_index : end_index + len(end_tag)]
        root = ET.fromstring(xml_string)
        file_count = 0
        project_root_abs = os.path.abspath(root_dir)

        for file_element in root.findall('file'):
            relative_path = file_element.get('path')
            if not relative_path:
                print("  - Skipping a <file> tag with no 'path' attribute.")
                continue
            
            # --- THIS IS THE FIX ---
            # Remove any leading slashes to prevent os.path.join from treating
            # it as an absolute path.
            sanitized_path = relative_path.lstrip('/\\')
            
            full_path = os.path.abspath(os.path.join(root_dir, sanitized_path))
            
            # The security check will now work correctly.
            if not full_path.startswith(project_root_abs):
                print(f"  - Skipping (Security Risk): {relative_path}")
                continue

            is_delete_operation = file_element.get('delete', 'false').lower() == 'true'

            if is_delete_operation:
                if os.path.exists(full_path) and os.path.isfile(full_path):
                    try:
                        os.remove(full_path)
                        print(f"  -- Deleted file:       {sanitized_path}")
                        parent_dir = os.path.dirname(full_path)
                        if not os.listdir(parent_dir) and parent_dir != project_root_abs:
                            os.rmdir(parent_dir)
                            print(f"  !  Removed empty dir:  {os.path.relpath(parent_dir, root_dir)}")
                    except Exception as e:
                        print(f"  - Error deleting {sanitized_path}: {e}")
                else:
                    print(f"  - Skipped deletion (not found): {sanitized_path}")
                continue
            
            raw_content = file_element.text if file_element.text is not None else ""
            content = clean_content(raw_content)

            try:
                parent_dir = os.path.dirname(full_path)
                if not os.path.exists(parent_dir):
                    os.makedirs(parent_dir)
                    print(f"  *  Created directory:  {os.path.relpath(parent_dir, root_dir)}")
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"  -> Updated file:       {sanitized_path}")
                file_count += 1
            except Exception as e:
                print(f"  - Error updating {sanitized_path}: {e}")
        
        print(f"\n✅ Success! Update complete. {file_count} files were processed.")
    except ET.ParseError as e:
        print(f"❌ Error: The XML block inside '{input_txt_path}' is malformed. Please check its structure.")
        print(f"  Details: {e}")
    except Exception as e:
        print(f"\n❌ An unexpected error occurred: {e}")

# The rest of the script is unchanged
def create_project_xml(root_dir, output_file_path):
    print(f"--- CREATE MODE ---")
    print(f"Scanning project in: '{root_dir}'")
    spec = load_ignore_spec(root_dir)
    xml_parts = []
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=True):
        kept_dirs = []
        for d in dirnames:
            full_dir_path = os.path.join(dirpath, d)
            relative_dir_path = os.path.relpath(full_dir_path, root_dir)
            path_for_spec = relative_dir_path.replace('\\', '/')
            if spec.match_file(path_for_spec + '/'):
                print(f"  - Ignoring directory:   {relative_dir_path}")
            else:
                kept_dirs.append(d)
        dirnames[:] = kept_dirs
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            relative_path_for_display = os.path.relpath(file_path, root_dir)
            if spec.match_file(file_path):
                print(f"  - Ignoring file (rule): {relative_path_for_display}")
                continue
            if is_binary(file_path):
                print(f"  - Ignoring file (binary):{relative_path_for_display}")
                continue
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                relative_path = relative_path_for_display.replace('\\', '/')
                file_block = f'  <file path="{relative_path}"><![CDATA[{content}]]></file>'
                xml_parts.append(file_block)
                print(f"  + Adding:               {relative_path}")
            except Exception as e:
                print(f"  - Error reading {relative_path_for_display}: {e}")
    try:
        with open(output_file_path, 'w', encoding='utf-8') as f:
            f.write(HEADER_TEXT.strip())
            f.write("\n\n")
            f.write("<project>\n")
            f.write("\n".join(xml_parts))
            f.write("\n</project>\n")
        print(f"\n✅ Success! Project context saved to '{output_file_path}'")
    except Exception as e:
        print(f"\n❌ Error writing output file: {e}")

def load_ignore_spec(root_dir):
    all_patterns = []
    gitignore_path = os.path.join(root_dir, '.gitignore')
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r', encoding='utf-8') as f:
            all_patterns.extend(f.readlines())
    custom_ignore_path = os.path.join(root_dir, CUSTOM_IGNORE_FILENAME)
    if os.path.exists(custom_ignore_path):
        with open(custom_ignore_path, 'r', encoding='utf-8') as f:
            all_patterns.extend(f.readlines())
    all_patterns.extend([ '.git/', os.path.basename(__file__), OUTPUT_FILENAME, UPDATE_FILENAME, CUSTOM_IGNORE_FILENAME, ])
    spec = pathspec.PathSpec.from_lines('gitwildmatch', all_patterns)
    if spec.patterns:
        print("  - Loaded ignore rules.")
    return spec

def is_binary(filepath, chunk_size=1024):
    try:
        with open(filepath, 'rb') as f:
            chunk = f.read(chunk_size)
            if b'\x00' in chunk: return True
    except (IOError, OSError):
        return True
    return False

def main():
    parser = argparse.ArgumentParser( description=f"A tool to manage project files.", formatter_class=argparse.RawTextHelpFormatter )
    action_group = parser.add_mutually_exclusive_group(required=True)
    action_group.add_argument('--create', action='store_true', help=f"Create a context file ('{OUTPUT_FILENAME}') from the project.")
    action_group.add_argument('--update', action='store_true', help=f"Update project files from '{UPDATE_FILENAME}' (non-interactive).")
    args = parser.parse_args()
    if args.create:
        output_path = os.path.join(ROOT_DIRECTORY, OUTPUT_FILENAME)
        create_project_xml(ROOT_DIRECTORY, output_path)
    elif args.update:
        update_path = os.path.join(ROOT_DIRECTORY, UPDATE_FILENAME)
        update_project_from_xml(ROOT_DIRECTORY, update_path)

if __name__ == "__main__":
    main()