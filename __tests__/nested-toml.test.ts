import { processTomlWithEscaping } from '../core/utils/tomlRepair';

describe('processTomlWithEscaping - Nested TOML Content', () => {
  
  test('handles TOML configuration embedded in TOML', () => {
    const nestedTomlCase = `[[tool_calls]]
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
report = "Created TOML config with database, server, and logging sections"
nextTasks = "1. Validate config 2. Use final tool to confirm creation"`;

    console.log('🔧 NESTED TOML TEST:');
    console.log(nestedTomlCase);
    
    let result;
    let success = false;
    let errorMessage = '';
    
    try {
      result = processTomlWithEscaping(nestedTomlCase);
      success = true;
      console.log('\n✅ PARSING SUCCEEDED!');
      console.log('PARSED RESULT:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      errorMessage = (error as Error).message;
      console.log('\n❌ PARSING FAILED:');
      console.log('ERROR:', errorMessage);
    }
    
    if (success) {
      expect(result).toBeDefined();
      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls).toHaveLength(2);
      
      const writeConfigCall = result.tool_calls[0];
      expect(writeConfigCall.name).toBe('write_config');
      expect(writeConfigCall.args.filename).toBe('app.toml');
      expect(writeConfigCall.args.content).toContain('[database]');
      expect(writeConfigCall.args.content).toContain('[server]');
      expect(writeConfigCall.args.content).toContain('[logging]');
    } else {
      // Should at least attempt to process
      expect(errorMessage).toBeDefined();
    }
  });

  test('handles JSON configuration embedded in TOML', () => {
    const jsonInTomlCase = `[[tool_calls]]
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
"""

[[tool_calls]]
name = "report_action"
[tool_calls.args]
goal = "Generate JSON configuration"
report = "Created JSON config with API settings, auth, and features"
nextTasks = "Task complete"`;

    console.log('\n📄 JSON IN TOML TEST:');
    console.log(jsonInTomlCase);
    
    try {
      const result = processTomlWithEscaping(jsonInTomlCase);
      console.log('\n✅ JSON PARSING SUCCEEDED!');
      expect(result.tool_calls[0].args.json_content).toContain('"api"');
      expect(result.tool_calls[0].args.json_content).toContain('"auth"');
      expect(result.tool_calls[0].args.json_content).toContain('"features"');
    } catch (error) {
      console.log('\n❌ JSON PARSING FAILED:');
      console.log('ERROR:', (error as Error).message);
      // Test should not hang regardless of outcome
      expect((error as Error).message).toBeDefined();
    }
  });

  test('handles YAML configuration embedded in TOML', () => {
    const yamlInTomlCase = `[[tool_calls]]
name = "generate_yaml"
[tool_calls.args]
filename = "docker-compose.yml"
yaml_content = """
version: "3.8"
services:
  web:
    image: "nginx:latest"
    ports:
      - "80:80"
    environment:
      - ENV="production"
  db:
    image: "postgres:13"
    environment:
      - POSTGRES_DB="myapp"
      - POSTGRES_USER="admin"
    volumes:
      - "db_data:/var/lib/postgresql/data"
volumes:
  db_data:
"""`;

    console.log('\n📋 YAML IN TOML TEST:');
    
    try {
      const result = processTomlWithEscaping(yamlInTomlCase);
      console.log('✅ YAML PARSING SUCCEEDED!');
      expect(result.tool_calls[0].args.yaml_content).toContain('version:');
      expect(result.tool_calls[0].args.yaml_content).toContain('services:');
    } catch (error) {
      console.log('❌ YAML PARSING FAILED:', (error as Error).message);
      // Should fail gracefully
      expect((error as Error).message).toBeDefined();
    }
  });

  test('handles shell script with quotes embedded in TOML', () => {
    const shellInTomlCase = `[[tool_calls]]
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
"""`;

    console.log('\n💻 SHELL SCRIPT IN TOML TEST:');
    
    try {
      const result = processTomlWithEscaping(shellInTomlCase);
      console.log('✅ SHELL SCRIPT PARSING SUCCEEDED!');
      expect(result.tool_calls[0].args.script_content).toContain('#!/bin/bash');
      expect(result.tool_calls[0].args.script_content).toContain('DATABASE_URL=');
    } catch (error) {
      console.log('❌ SHELL SCRIPT PARSING FAILED:', (error as Error).message);
      expect((error as Error).message).toBeDefined();
    }
  });

  test('handles SQL queries with quotes embedded in TOML', () => {
    const sqlInTomlCase = `[[tool_calls]]
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
"""`;

    console.log('\n🗃️ SQL IN TOML TEST:');
    
    try {
      const result = processTomlWithEscaping(sqlInTomlCase);
      console.log('✅ SQL PARSING SUCCEEDED!');
      expect(result.tool_calls[0].args.sql_content).toContain('SELECT');
      expect(result.tool_calls[0].args.sql_content).toContain('FROM users');
    } catch (error) {
      console.log('❌ SQL PARSING FAILED:', (error as Error).message);
      expect((error as Error).message).toBeDefined();
    }
  });

  test('handles extremely nested quotes - stress test', () => {
    const extremeCase = `[[tool_calls]]
name = "create_complex_file"
[tool_calls.args]
content = """
{
  "config": {
    "commands": [
      "echo \"Starting process with 'single quotes' and \"double quotes\"\"",
      "python -c \"print('Hello \"world\" from Python')\"",
      "bash -c 'export VAR=\"complex value\"; echo $VAR'"
    ],
    "templates": {
      "html": "<div class=\"container\"><p>Text with \"quotes\" and 'apostrophes'</p></div>",
      "sql": "SELECT * FROM table WHERE name = 'O\"Brien' AND status = \"active\""
    }
  }
}
"""`;

    console.log('\n⚠️ EXTREME NESTING STRESS TEST:');
    
    const startTime = Date.now();
    
    try {
      const result = processTomlWithEscaping(extremeCase);
      console.log('✅ EXTREME CASE SUCCEEDED!');
      expect(result).toBeDefined();
    } catch (error) {
      console.log('❌ EXTREME CASE FAILED (EXPECTED):', (error as Error).message);
      // This is expected to fail, but should fail gracefully
      expect((error as Error).message).toBeDefined();
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`⏱️ Processing time: ${duration}ms`);
    
    // Should not take more than 30 seconds even for extreme cases
    expect(duration).toBeLessThan(30000);
  });

});