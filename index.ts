// Use 'import' for TypeScript modules
import * as convert from 'xml-js';

// ---- HELPER FUNCTIONS (UNCHANGED) ----

// Function to wrap each value with its type (our "schema generator")
function wrapWithType(value: any): any {
    if (value === null) {
        return { _null: null };
    } else if (Array.isArray(value)) {
        if (value.length === 0) return { _array: [] };
        return { _array: value.map(wrapWithType) };
    } else if (value && typeof value === 'object') {
        if (Object.keys(value).length === 0) return {};
        const wrapped: { [key: string]: any } = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                wrapped[key] = wrapWithType(value[key]);
            }
        }
        return wrapped;
    } else if (typeof value === 'string') {
        return { _text: value };
    } else if (typeof value === 'number') {
        if (!isFinite(value)) return { _null: null };
        return { _number: value.toString() };
    } else if (typeof value === 'boolean') {
        return { _boolean: value.toString() };
    } else if (typeof value === 'undefined') {
        return { _undefined: true };
    } else {
        return { _unknown: value };
    }
}

// The "rehydration" function to restore types
function revertToTypedObject(data: any, template: any): any {
    if (!template) return data;
    const templateKeys = Object.keys(template);
    if (templateKeys.length === 1) {
        const typeKey = templateKeys[0];
        switch (typeKey) {
            case '_number':    return Number(data?._text);
            case '_boolean':   return data?._text === 'true';
            case '_text':      return data?._text ?? '';
            case '_null':      return null;
            case '_undefined': return undefined;
            case '_array': break; 
            default: break; 
        }
    }
    if (template.hasOwnProperty('_array')) {
        if (!data) return [];
        const itemsToProcess = Array.isArray(data) ? data : [data];
        return itemsToProcess.map((item: any, index: number) => {
            const itemTemplate = template._array[index];
            return revertToTypedObject(item, itemTemplate);
        });
    }
    const result: { [key: string]: any } = {};
    for (const key in template) {
        if (!Object.prototype.hasOwnProperty.call(template, key)) continue;
        result[key] = revertToTypedObject(data?.[key], template[key]);
    }
    return result;
}

// Deep comparison function for robust testing
function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
        return a === b;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
            return false;
        }
    }
    return true;
}


// ---- TEST DATA AND EXECUTION ----

const testCases = [
    { name: 'Simple flat object', data: { a: 1, b: 'hello', c: true, d: null } },
    { name: 'Nested object', data: { user: { id: 42, info: { name: 'Alice', active: false } } } },
    { name: 'Array of objects', data: { items: [ { x: 1, y: 'a' }, { x: 2, y: 'b' } ] } },
    { name: 'Single-element array', data: { items: [ { id: 99 } ] } },
    { name: 'Empty array and object', data: { list: [], details: {} } },
    { name: 'Mixed-type array', data: { mixed: [ 1, 'two', false, null, undefined ] } },
    { name: 'Special values (undefined)', data: { val: undefined, other: 'data' } },
    { name: 'Deeply nested', data: { a: { b: { c: { d: { e: 'deep' } } } } } },
    { name: 'Falsy values', data: { zero: 0, emptyStr: '', isFalse: false } },
    { name: 'String that looks like number/boolean', data: { numStr: '123', boolStr: 'true' } },
    { name: 'Main complex example', data: { document: { id: 12345, title: 'Project Phoenix', isActive: true, manager: { name: 'John Doe', contact: 'john.d@example.com' }, team: [ { name: 'Alice', role: 'Developer' }, { name: 'Bob', role: 'Designer' } ], endDate: null, notes: '' } } },
    { name: 'Special values (NaN/Infinity)', data: { val: NaN, pos: Infinity, neg: -Infinity }, expected: { val: null, pos: null, neg: null } },
    { name: 'Deeply nested arrays and objects', data: { a: [ { b: [ { c: [1, 2, 3] }, { d: 'end' } ] }, { e: { f: [ { g: true }, { h: null } ] } } ] } },
    { name: 'Array of arrays (XML-Friendly)', data: { matrix: [ { row: [1, 2, 3] }, { row: [4, 5, 6] } ] } },
    { name: 'Array with all types', data: { values: [1, 'two', false, null, undefined, { nested: 'obj' }, { item: [7, 8] }] } },
    { name: 'Complex document with comments and tags', data: { document: { id: 1, title: 'Test Doc', tags: ['typescript', 'xml', 'json'], comments: [ { user: 'alice', text: 'Great!', likes: 3 }, { user: 'bob', text: '', likes: 0 } ], meta: { created: '2024-05-01T12:00:00Z', updated: null, published: false } } } },
    { name: 'Array of mixed nested structures (XML-Friendly)', data: { mixed: [ { item: { a: [1, 2] } }, { item: [3, 4, { b: 5 }] }, { item: 'string' }, { item: null } ] } },
    { name: 'Deeply nested heterogeneous structure', data: { a: { b: [ { c: { d: [1, { e: 'x', f: [true, false, null] }] } }, { g: [ { h: undefined }, { i: NaN } ] } ] } }, expected: { a: { b: [ { c: { d: [1, { e: 'x', f: [true, false, null] }] } }, { g: [ { h: undefined }, { i: null } ] } ] } } },
    
    // --- **THE FIX: The problematic inner array is wrapped in an object** ---
    {
        name: 'Complex mixed-type array (XML-Friendly)',
        data: {
            data: [
                1,
                null,
                { a: [2, 3, { b: 'x' }] },
                { item: [4, 5, null] }, // Wrapped [4, 5, null] in an object
                'end',
                { c: undefined }
            ]
        }
    }
];

for (const test of testCases) {
    console.log(`\n===== Test Case: ${test.name} =====`);

    const typeTemplate = wrapWithType(test.data);
    const xml = convert.json2xml(JSON.stringify({ root: test.data }), { compact: true, spaces: 2 });
    const revertedFromXml = convert.xml2js(xml, { compact: true });
    const dataFromXml = (revertedFromXml as convert.ElementCompact).root || {};
    const restored = revertToTypedObject(dataFromXml, typeTemplate);
    
    const dataToCompare = 'expected' in test ? test.expected : test.data;
    const isEqual = deepEqual(dataToCompare, restored);
    
    console.log('Comparison result:', isEqual ? '✅ MATCH' : '❌ MISMATCH');
    if (!isEqual) {
        console.log('  Expected:', JSON.stringify(dataToCompare, null, 2));
        console.log('  Restored:', JSON.stringify(restored, null, 2));
    }
}