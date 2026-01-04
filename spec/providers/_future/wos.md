# Web of Science Provider (Planned)

## Status

**Not yet implemented** - Pending API key acquisition

## API Overview

**API**: Web of Science Starter API or Expanded API
**Base URL**: `https://api.clarivate.com/apis/wos-starter/v1/`
**Authentication**: API key required (subscription)

## Notes for Implementation

- Query syntax similar to WoS web interface
- Field tags: `TI=`, `AB=`, `AU=`, `TS=` (topic)
- Boolean: `AND`, `OR`, `NOT`
- Pagination via offset
- Rate limits depend on subscription tier

## References

- [WoS API Documentation](https://developer.clarivate.com/apis/wos)
