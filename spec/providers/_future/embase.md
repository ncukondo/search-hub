# Embase Provider (Planned)

## Status

**Not yet implemented** - No institutional access

## Overview

Embase is Elsevier's biomedical database with focus on pharmacology and drug research. Uses Emtree controlled vocabulary.

## Access Options

1. **No public API** - Requires institutional subscription
2. **Ovid Embase** - Different interface/API
3. **Elsevier platform** - May share API with Scopus

## Alternative Approach

For institutions without API access:
- Manual search via web interface
- Export results as RIS/CSV
- Import via file adapter (future feature)

## Notes for Implementation

- Emtree vocabulary similar to MeSH but drug-focused
- Consider supporting RIS file import as workaround
