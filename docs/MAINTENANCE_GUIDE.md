# Maintenance Guide

## Recommended Workflow

1. Add new typing texts only into:
   - data/texts/*.json

2. After adding texts:
   - Run:
     - node tests/static-check.mjs
     - node tools/validate-data.mjs

3. Before release:
   - Run all tests in /tests

## Folder Roles

- data/texts/
  Typing text database by genre

- js/modules/
  Main application modules

- js/legacy/
  Backup or old implementations only

- tests/
  Simple integration and validation tests

- tools/
  Data maintenance scripts

## Naming Rules

### Genre IDs
Use only internal English IDs:
- geography
- science
- culture
- society
etc.

Do not mix Japanese labels into JSON internal fields.

## Safe Expansion

Recommended upper limit:
- 300 to 1000 typing texts

Current structure is stable enough for continued expansion.
