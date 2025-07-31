export class TomlSanitizer {
  
  static sanitize(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.sanitize(item));
    }
    
    if (value && typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = this.sanitize(val);
      }
      return sanitized;
    }
    
    return value;
  }
  
  private static sanitizeString(str: string): string {
    if (this.needsQuoting(str)) {
      return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    
    return str;
  }
  
  private static needsQuoting(str: string): boolean {
    // TOML strings with special characters need quoting
    if (str.trim() !== str) return true;
    
    // Strings that look like dates
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return true;
    
    // Strings with special TOML characters
    if (/[#\[\]{}="]/.test(str)) return true;
    
    // Strings that look like booleans or numbers
    if (/^(true|false)$/i.test(str.trim())) return true;
    if (/^[+-]?[\d.]+$/.test(str.trim())) return true;
    
    return false;
  }
  
  static sanitizeTomlContent(tomlContent: string): string {
    // For now, return the content as-is since TOML is generally more forgiving
    // We can add more sophisticated sanitization later if needed
    return tomlContent;
  }
}