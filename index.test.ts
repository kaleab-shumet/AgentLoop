import { json2xml, xml2json, ElementCompact } from 'xml-js';

// --- Improved Conversion Helpers with Array, Null, and Empty String Markers ---
function toXmlJsFormat(obj: any): ElementCompact {
  if (obj === null) return { _isNull: true };
  if (obj === "") return { _isEmptyString: true };
  if (Array.isArray(obj)) {
    return { _isArray: true, item: obj.map(item => toXmlJsFormat(item)) };
  }
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return { _text: String(obj) };
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = toXmlJsFormat(obj[key]);
    }
    return result;
  }
  return obj;
}

function fromXmlJsFormat(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if ('_isNull' in obj) return null;
  if ('_isEmptyString' in obj) return "";
  if ('_isArray' in obj) {
    if (!('item' in obj)) return [];
    if (Array.isArray(obj.item)) return obj.item.map(fromXmlJsFormat);
    return [fromXmlJsFormat(obj.item)];
  }
  if ('_text' in obj) {
    const txt = obj._text;
    if (txt === 'true') return true;
    if (txt === 'false') return false;
    if (!isNaN(Number(txt)) && txt !== '') return Number(txt);
    return txt;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) return {};
  const result: any = {};
  for (const key of keys) {
    result[key] = fromXmlJsFormat(obj[key]);
  }
  return result;
}

// --- Test Cases ---
const testCases = [
  {
    name: 'Simple flat object',
    obj: { a: 1, b: 'test', c: true }
  },
  {
    name: 'Nested object',
    obj: { user: { name: 'Alice', age: 30, active: false } }
  },
  {
    name: 'Array of objects',
    obj: { items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
  },
  {
    name: 'Mixed types and nulls',
    obj: { str: 'hello', num: 0, bool: false, nul: null, arr: [null, 1, 'x', false, { y: null }] }
  },
  {
    name: 'Deeply nested',
    obj: { a: { b: { c: { d: [1, 2, { e: 'deep' }] } } } }
  },
  {
    name: 'Edge case: empty array and object',
    obj: { emptyArr: [], emptyObj: {}, arr: [[], {}], obj: { a: [] } }
  },
  {
    name: '5-level nested object with arrays at each level',
    obj: {
      level1: [
        {
          level2: [
            {
              level3: [
                {
                  level4: [
                    {
                      level5: [1, 2, 3, { deep: 'value', arr: [true, false, null] }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    name: 'Object with arrays of objects, each containing further arrays and objects',
    obj: {
      users: [
        {
          id: 1,
          info: {
            emails: ['a@example.com', 'b@example.com'],
            phones: [{ type: 'home', number: null }, { type: 'work', number: '123-456' }]
          },
          tags: []
        },
        {
          id: 2,
          info: {
            emails: [],
            phones: []
          },
          tags: ['admin', 'editor']
        }
      ],
      meta: { created: 'now', updated: null }
    }
  },
  {
    name: 'Alternating arrays and objects for 6+ levels',
    obj: {
      a: [
        { b: [
          { c: [
            { d: [
              { e: [
                { f: 'bottom', g: [1, 2, 3] }
              ] }
            ] }
          ] }
        ] }
      ]
    }
  },
  {
    name: 'Deeply nested nulls and empty arrays/objects at various depths',
    obj: {
      a: null,
      b: [null, {}, []],
      c: {
        d: [
          { e: null, f: [], g: {} },
          null,
          []
        ],
        h: { i: null, j: [], k: {} }
      }
    }
  },
  {
    name: 'Mixed types, booleans, numbers, and special characters at deep levels',
    obj: {
      a: {
        b: [
          { c: { d: [1, 'two', null, { e: '!@#$%^&*()_+', f: [true, false, 123.456, 'deep\n\t'] }] } },
          { c: { d: [3.1415, true, false, '\n\t'] } }
        ],
        f: 'Line1\nLine2\tTabbed',
        g: [
          { h: [null, '', 0, false, { i: 'end' }] }
        ]
      }
    }
  }
];

// --- Test Runner ---
const failedTests: { name: string, original: any, reverted: any }[] = [];

testCases.forEach(({ name, obj }, idx) => {
  // Wrap in root for XML
  const root = { root: toXmlJsFormat(obj) };
  const xml = json2xml(JSON.stringify(root), { compact: true, spaces: 2 });
  const xmlToJson = xml2json(xml, { compact: true, spaces: 2 });
  const parsedXmlJs: ElementCompact = JSON.parse(xmlToJson);
  const reverted = fromXmlJsFormat(parsedXmlJs.root);

  const accurate = JSON.stringify(obj) === JSON.stringify(reverted);
  console.log(`Test #${idx + 1}: ${name}`);
  console.log('  Accurate:', accurate);
  if (!accurate) {
    failedTests.push({ name, original: obj, reverted });
  }
  console.log('---');
});

if (failedTests.length > 0) {
  console.log('\n=== FAILED TESTS SUMMARY ===');
  failedTests.forEach(({ name, original, reverted }) => {
    console.log(`\nFailed Test: ${name}`);
    console.log('  Original:', JSON.stringify(original, null, 2));
    console.log('  Reverted:', JSON.stringify(reverted, null, 2));
    console.log('--------------------------');
  });
} else {
  console.log('\nAll tests passed!');
}
