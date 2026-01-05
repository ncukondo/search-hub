# ADR-004: XML Parser Library Selection

## Status

Accepted

## Context

PubMed (E-utilities) and arXiv APIs return XML responses that need to be parsed into structured data. We need to choose an XML parsing library for these providers.

Key requirements:
- Parse PubMed XML (efetch response with article metadata)
- Parse arXiv Atom XML feed
- Convert XML to JavaScript objects for easy data extraction
- Good TypeScript support
- Minimal dependencies

Options considered:
1. **fast-xml-parser** - Pure JS, converts XML to JSON, high performance
2. **xml2js** - Popular but older, callback-based API
3. **cheerio** - jQuery-like API, also handles HTML
4. **jsdom** - Full DOM implementation, heavier weight

## Decision

Use `fast-xml-parser` for XML parsing in PubMed and arXiv providers.

## Consequences

### Positive

- Lightweight with minimal dependencies
- Fast parsing performance
- Good TypeScript type definitions
- Converts XML directly to JSON objects, making data access straightforward
- Configurable parsing options (attribute handling, text node naming, etc.)
- Works in both Node.js and browser environments

### Negative

- Less intuitive than DOM-based APIs for complex queries
- XML namespaces require configuration
- Learning curve for parser options configuration

### Neutral

- Need to configure parser options per response format (PubMed vs arXiv)
- JSON output structure depends on configuration choices
