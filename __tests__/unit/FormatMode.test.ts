import { FormatMode } from '../../core/types/types';

describe('FormatMode', () => {
  it('should have function calling mode', () => {
    expect(FormatMode.FUNCTION_CALLING).toBe('function_calling');
  });

  it('should have yaml mode', () => {
    expect(FormatMode.YAML_MODE).toBe('yaml_mode');
  });

  it('should have correct enum values', () => {
    const modes = Object.values(FormatMode);
    expect(modes).toContain('function_calling');
    expect(modes).toContain('yaml_mode');
    expect(modes).toHaveLength(2);
  });
});