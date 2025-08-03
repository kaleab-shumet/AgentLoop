import { processTomlWithEscaping } from '../core/utils/tomlRepair';

describe('TOML Repair Function', () => {
  // Complex test cases that could potentially break the function
  const testCases = [
    {
      name: 'Python with nested triple quotes in docstrings',
      toml: `python_code = """
class DataProcessor:
    \\"\\"\\"
    A class for processing data with embedded quotes: "example"
    \\"\\"\\"
    
    def process(self):
        \\"\\"\\"Method with 'single' quotes\\"\\"\\"
        return "result"
    
    def complex_method(self):
        \\"\\"\\"
        Method with embedded \\"\\"\\"triple quotes\\"\\"\\" in docstring
        \\"\\"\\"
        code = '''
        def inner():
            print("nested quotes")
        '''
        return code
"""`
    },
    {
      name: 'TOML configuration embedded in TOML',
      toml: `[[tool_calls]]
name = "write_config"
[tool_calls.args]
filename = "app.toml"
content = """
[database]
host = "localhost"
port = 5432
name = "myapp"

[server]
host = "0.0.0.0"
port = 8080
debug = true

[logging]
level = "info"
format = "json"
"""

[[tool_calls]]
name = "report_action"
[tool_calls.args]
goal = "Create configuration file"
report = "Created TOML config with database, server, and logging sections"`
    },
    {
      name: 'JSON configuration embedded in TOML',
      toml: `[[tool_calls]]
name = "create_json_config"
[tool_calls.args]
config_name = "api_settings"
json_content = """
{
  "api": {
    "base_url": "https://api.example.com",
    "timeout": 30,
    "retries": 3
  },
  "auth": {
    "type": "bearer",
    "token": "abc123"
  },
  "features": {
    "cache": true,
    "logging": "debug"
  }
}
"""`
    },
    {
      name: 'Shell script with mixed quotes',
      toml: `[[tool_calls]]
name = "create_script"
[tool_calls.args]
filename = "deploy.sh"
script_content = """
#!/bin/bash
echo "Starting deployment..."
export DATABASE_URL="postgresql://user:pass@localhost/db"
docker run -e NODE_ENV="production" -v "$(pwd):/app" myapp
if [ "$?" -eq 0 ]; then
    echo "Deployment successful!"
else
    echo "Deployment failed!"
    exit 1
fi
"""`
    },
    {
      name: 'SQL queries with complex quoting',
      toml: `[[tool_calls]]
name = "execute_sql"
[tool_calls.args]
query_name = "user_report"
sql_content = """
SELECT 
    u.id,
    u.name AS "User Name",
    u.email,
    COUNT(o.id) AS "Order Count"
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
    AND u.status = 'active'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY "Order Count" DESC;
"""`
    },
    {
      name: 'Markdown with code blocks',
      toml: `[[tool_calls]]
name = "create_documentation"
[tool_calls.args]
filename = "README.md"
markdown_content = """
# Project Documentation

## Python Example

\`\`\`python
def example():
    \\"\\"\\"
    This is a docstring with quotes: "example"
    \\"\\"\\"
    return "string with \\"quotes\\""
\`\`\`

## Bash Example

\`\`\`bash
echo "Command with 'mixed' \\"quotes\\""
\`\`\`
"""`
    },
    {
      name: 'Working Python code with string literals',
      toml: `[[tool_calls]]
name = "write_python_file"
[tool_calls.args]
filename = "data_processor.py"
python_code = """
import json
import logging

class DataProcessor:
    \\"\\"\\"
    A robust data processor that handles JSON and CSV files.
    Supports various quote types: "double", 'single', and \\"\\"\\"triple\\"\\"\\".
    \\"\\"\\"
    
    def __init__(self, config_path="config.json"):
        self.config = self._load_config(config_path)
        self.logger = logging.getLogger(__name__)
        
    def _load_config(self, path):
        \\"\\"\\"Load configuration from JSON file\\"\\"\\"
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            self.logger.error(f"Config file not found: {path}")
            return {}
    
    def process_data(self, data):
        \\"\\"\\"
        Process data with embedded quotes and special characters.
        
        Examples:
            >>> processor = DataProcessor()
            >>> result = processor.process_data({"name": "O'Brien", "quote": "He said \\"Hello\\""})
        \\"\\"\\"
        processed = {}
        for key, value in data.items():
            if isinstance(value, str):
                # Handle quotes in strings
                escaped = value.replace('"', '\\\\"').replace("'", "\\\\'")
                processed[key] = f"Processed: {escaped}"
            else:
                processed[key] = value
        return processed
    
    def generate_sql(self, table, conditions):
        \\"\\"\\"Generate SQL with proper quote escaping\\"\\"\\"
        sql = f'''
        SELECT * FROM {table}
        WHERE name = 'O\\"Brien'
        AND description LIKE '%said \\"hello\\"%'
        AND data = '{json.dumps(conditions)}'
        '''
        return sql.strip()
"""`
    },
    {
      name: 'Working Java code with string handling',
      toml: `[[tool_calls]]
name = "write_java_file"
[tool_calls.args]
filename = "StringProcessor.java"
java_code = """
package com.example.processor;

import java.util.*;
import java.util.regex.Pattern;

/**
 * A utility class for processing strings with various quote types.
 * Handles "double quotes", 'single quotes', and complex escaping.
 */
public class StringProcessor {
    private static final String DEFAULT_DELIMITER = ",";
    private static final Pattern QUOTE_PATTERN = Pattern.compile("[\\"\\'\\']+");
    
    /**
     * Constructor with default settings.
     */
    public StringProcessor() {
        this.delimiter = DEFAULT_DELIMITER;
    }
    
    /**
     * Process a string containing various quote types.
     * 
     * @param input The input string with quotes like "hello" or 'world'
     * @return Processed string with escaped quotes
     */
    public String processQuotes(String input) {
        if (input == null || input.isEmpty()) {
            return "";
        }
        
        // Handle different quote scenarios
        String result = input
            .replace("\\\\", "\\\\\\\\")  // Escape existing escapes
            .replace("\\"", "\\\\\\\\\\"")     // Escape double quotes
            .replace("'", "\\\\\\\\\\'");       // Escape single quotes
            
        return "Processed: " + result;
    }
    
    /**
     * Generate JSON string with proper escaping.
     */
    public String generateJson(Map<String, Object> data) {
        StringBuilder json = new StringBuilder("{");
        boolean first = true;
        
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            if (!first) json.append(",");
            first = false;
            
            String key = entry.getKey();
            Object value = entry.getValue();
            
            json.append("\\\\\\"").append(key).append("\\\\\\":");
            
            if (value instanceof String) {
                String strValue = (String) value;
                strValue = strValue.replace("\\\\\\\\", "\\\\\\\\\\\\\\\\").replace("\\\\\\"", "\\\\\\\\\\\\\\"");
                json.append("\\\\\\"").append(strValue).append("\\\\\\"");
            } else {
                json.append(value.toString());
            }
        }
        
        json.append("}");
        return json.toString();
    }
    
    /**
     * Main method for testing.
     */
    public static void main(String[] args) {
        StringProcessor processor = new StringProcessor();
        
        String test1 = "He said \\\\\\"Hello world!\\\\\\" to everyone";
        String test2 = "Mix of 'single' and \\\\\\"double\\\\\\" quotes";
        
        System.out.println("Test 1: " + processor.processQuotes(test1));
        System.out.println("Test 2: " + processor.processQuotes(test2));
        
        Map<String, Object> data = new HashMap<>();
        data.put("message", "She said \\\\\\"Hi\\\\\\" yesterday");
        data.put("count", 42);
        
        System.out.println("JSON: " + processor.generateJson(data));
    }
}
"""`
    },
    {
      name: 'Working Kotlin code with string templates',
      toml: `[script]
code2 = """
def greet2(name):
    """
    This is a multiline comment in Python structure.
    It explains that this function greets the user by name.
    """
    print("hello")
    return """Greet2"""
"""`
    },
    {
      name: 'Working Kotlin code with string templates',
      toml: `[[tool_calls]]
    name = "write_kotlin_file"
    [tool_calls.args]
    filename = "DataFormatter.kt"
    kotlin_code = """
    package com.example.formatter

    import kotlinx.serialization.json.*
    import java.time.LocalDateTime
    import java.time.format.DateTimeFormatter

    /**
     * A Kotlin class for formatting data with complex string handling.
     * Supports "double quotes", 'single quotes', and string templates.
     */
    class DataFormatter {

        companion object {
            private const val DEFAULT_FORMAT = "yyyy-MM-dd HH:mm:ss"
            private val DATE_FORMATTER = DateTimeFormatter.ofPattern(DEFAULT_FORMAT)
        }

        /**
         * Format user data with proper quote escaping.
         */
        fun formatUserData(name: String, message: String, timestamp: LocalDateTime): String {
            val escapedName = name.replace("\\"", "\\\\\\\\\\"").replace("'", "\\\\\\\\\\'")
            val escapedMessage = message.replace("\\"", "\\\\\\\\\\"").replace("'", "\\\\\\\\\\'")
            val formattedTime = timestamp.format(DATE_FORMATTER)

            return \\"\\"\\"
            {
                "user": "$escapedName",
                "message": "$escapedMessage",
                "timestamp": "$formattedTime",
                "metadata": {
                    "processed": true,
                    "quotes_escaped": true
                }
            }
            \\"\\"\\".trimIndent()
        }

        /**
         * Generate SQL query with Kotlin string templates.
         */
        fun generateUserQuery(userId: Int, status: String): String {
            val escapedStatus = status.replace("'", "''")  // SQL escape

            return \\"\\"\\"
            SELECT 
                u.id,
                u.name,
                u.email,
                u.status,
                CASE 
                    WHEN u.last_login > NOW() - INTERVAL '30 days' 
                    THEN 'Active'
                    ELSE 'Inactive'
                END as activity_status
            FROM users u
            WHERE u.id = $userId
            AND u.status = '$escapedStatus'
            AND u.created_at >= '2024-01-01'
            ORDER BY u.last_login DESC
            \\"\\"\\".trimIndent()
        }

        /**
         * Process configuration strings with various quote types.
         */
        fun processConfig(config: Map<String, Any>): String {
            val jsonBuilder = StringBuilder()
            jsonBuilder.append("{\\\\n")

            config.entries.forEachIndexed { index, (key, value) ->
                if (index > 0) jsonBuilder.append(",\\\\n")

                val escapedKey = key.replace("\\"", "\\\\\\\\\\"")
                jsonBuilder.append("  \\\\\\"$escapedKey\\\\\\": ")

                when (value) {
                    is String -> {
                        val escapedValue = value
                            .replace("\\\\\\\\", "\\\\\\\\\\\\\\\\")
                            .replace("\\"", "\\\\\\\\\\"")
                            .replace("\\\\n", "\\\\\\\\n")
                            .replace("\\\\t", "\\\\\\\\t")
                        jsonBuilder.append("\\\\\\"$escapedValue\\\\\\"")
                    }
                    is Number -> jsonBuilder.append(value)
                    is Boolean -> jsonBuilder.append(value)
                    else -> jsonBuilder.append("\\\\\\"" + value.toString().replace("\\"", "\\\\\\\\\\"") + "\\\\\\"")
                }
            }

            jsonBuilder.append("\\\\n}")
            return jsonBuilder.toString()
        }
    }

    /**
     * Example usage and testing.
     */
    fun main() {
        val formatter = DataFormatter()

        // Test with complex strings
        val userData = formatter.formatUserData(
            name = "O'Brien",
            message = "He said \\\\\\"Hello world!\\\\\\" and left",
            timestamp = LocalDateTime.now()
        )

        println("User Data JSON:")
        println(userData)

        // Test SQL generation
        val query = formatter.generateUserQuery(
            userId = 123,
            status = "active with \\\\\\"special\\\\\\" chars"
        )

        println("\\\\nGenerated SQL:")
        println(query)

        // Test config processing
        val config = mapOf(
            "database_url" to "postgresql://user:pass@localhost/db",
            "api_key" to "secret_key_with_\\\\\\"quotes\\\\\\"",
            "debug_mode" to true,
            "max_connections" to 100
        )

        val configJson = formatter.processConfig(config)
        println("\\\\nConfig JSON:")
        println(configJson)
    }
    """`
    },
    {
      name: 'Simple nested quotes - print function',
      toml: `code = "print("hello")"`
    },
    {
      name: 'Simple nested quotes - dialogue',
      toml: `message = "He said "Hi" to me"`
    },
    {
      name: 'Simple nested quotes - file path',
      toml: `path = "C:\\\\Users\\\\John"s Documents\\\\file.txt"`
    },
    {
      name: 'Simple nested quotes - SQL query',
      toml: `query = "SELECT * FROM users WHERE name = "John""`
    }
  ];

  // Test each case
  testCases.forEach((testCase, index) => {
    test(`${index + 1}. ${testCase.name}`, () => {
      expect(() => {
        const result = processTomlWithEscaping(testCase.toml);
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
      }).not.toThrow();
    });
  });

  // Additional sophisticated edge cases
  describe('Sophisticated Edge Cases', () => {
    test('Mixed quote types in single string', () => {
      const toml = `text = "She said 'Hello "world"!' yesterday"`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });

    test('Nested JSON with escaped quotes', () => {
      const toml = `config = "{\\"key\\": \\"value with \\"nested\\" quotes\\"}"`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });

    test('Unicode characters with quotes', () => {
      const toml = `message = "Unicode: 你好 "world" 🌍"`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });

    test('Very long string with multiple quote types', () => {
      const longString = 'a'.repeat(1000) + '"nested"' + 'b'.repeat(1000);
      const toml = `long_text = "${longString}"`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });

    test('Empty triple quote strings', () => {
      const toml = `empty = """"""`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });

    test('Regex patterns with quotes', () => {
      const toml = `pattern = "\\\\w+@[a-zA-Z_]+?\\\\.[a-zA-Z]{2,3}\\"test\\""`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });

    test('HTML with quotes', () => {
      const toml = `html = "<div class=\\"container\\"><p>Hello \\"world\\"!</p></div>"`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });

    test('Multiple TOML entries with quote conflicts', () => {
      const toml = `
        entry1 = "First "quoted" entry"
        entry2 = "Second "different" entry"
        entry3 = "Third "another" entry"
      `;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });
  });

  // Performance tests
  describe('Performance Tests', () => {
    test('Large input with many quotes', () => {
      const largeToml = `data = "${'quote nested'.repeat(100)}"`;
      const startTime = Date.now();
      expect(() => processTomlWithEscaping(largeToml)).not.toThrow();
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    test('Multiple quote pairs', () => {
      const toml = `entry1 = "value1"\nentry2 = "value2"\nentry3 = "value3"`;
      expect(() => processTomlWithEscaping(toml)).not.toThrow();
    });
  });

  // Error handling tests
  describe('Error Handling', () => {
    test('Invalid TOML structure should throw meaningful error', () => {
      const invalidToml = 'completely invalid toml content';
      expect(() => processTomlWithEscaping(invalidToml)).toThrow();
    });

    test('Empty input should throw', () => {
      expect(() => processTomlWithEscaping('')).toThrow('Empty or whitespace-only');
    });

    test('Whitespace only should throw', () => {
      expect(() => processTomlWithEscaping('   \n\t   ')).toThrow('Empty or whitespace-only');
    });

    test('Max attempts exceeded should throw original error', () => {
      const problematicToml = `value = "${'"'.repeat(10)}"`;
      expect(() => processTomlWithEscaping(problematicToml, [], 3)).toThrow();
    });
  });
});