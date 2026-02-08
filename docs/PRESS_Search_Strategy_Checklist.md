# PRESS Search Strategy Evaluation Checklist

A Practical Guide for Building and Evaluating Search Strategies for Systematic Reviews and Scoping Reviews

> Source: @mcgowan_press_report_2016

---

## Overview

PRESS is an evidence-based checklist consisting of 6 elements for evaluating the quality of electronic literature search strategies for systematic reviews (SRs), scoping reviews, and health technology assessments (HTAs).

---

## The 6 Evaluation Elements

### 1. Translation of the Research Question

**Purpose**: Assess whether the research question has been correctly translated into search concepts.

#### Checklist
- [ ] Does the search strategy match the research question/PICO?
- [ ] Are the search concepts clear?
- [ ] Are there too many or too few PICO elements included?
- [ ] Are the search concepts too narrow or too broad?
- [ ] Does the search retrieve too many or too few records? (Show number of hits per line)
- [ ] Are unconventional or complex strategies explained?

#### Guidance
- The research question (typically formatted as PICO) should be submitted with the search strategy
- A formulaic application of PICO leads to variable results; subtleties in concept translation are necessary
- Consider which PICO elements are essential for the search vs. screening

---

### 2. Boolean and Proximity Operators

**Purpose**: Assess whether the elements addressing the search question have been correctly combined.

#### Checklist
- [ ] Are Boolean or proximity operators used correctly?
- [ ] Is the use of nesting with brackets appropriate and effective?
- [ ] If NOT is used, is this likely to result in any unintended exclusions?
- [ ] Could precision be improved by using proximity operators (e.g., ADJ, NEAR, WITHIN) or phrase-searching instead of AND?
- [ ] Is the width of proximity operators suitable (e.g., might adj5 pick up more variants than adj2)?

#### Guidance
- **AND**: Combines different concepts (narrows results)
- **OR**: Combines synonyms/related terms (broadens results)
- **NOT**: Use with caution; may cause unintended exclusions. Consider subject headings, check tags, or limits as alternatives
- Proximity operators vary by database platform

#### Proximity Operators by Database

| Database | Operator | Description |
|----------|----------|-------------|
| Ovid | adjN | Within N words (ordered) |
| Ovid | nearN | Within N words (unordered) |
| PubMed | - | No proximity operators |
| EBSCO | NN | Within N words |
| ProQuest | NEAR/N | Within N words |

---

### 3. Subject Headings (Database-Specific)

**Purpose**: Assess whether there is enough scope in the selection of subject headings to optimize recall.

#### Checklist
- [ ] Are the subject headings relevant?
- [ ] Are any relevant subject headings missing (e.g., previous index terms)?
- [ ] Are any subject headings too broad or too narrow?
- [ ] Are subject headings exploded where necessary and vice versa?
- [ ] Are major headings ("starring" or restrict to focus) used? If so, is there adequate justification?
- [ ] Are subheadings missing?
- [ ] Are subheadings attached to subject headings? (Floating subheadings may be preferred)
- [ ] Are floating subheadings relevant and used appropriately?
- [ ] Are both subject headings AND free text terms used for each concept?

#### Guidance
- Subject headings are database-specific (MEDLINE = MeSH, Embase = EMTREE)
- Floating subheadings are often preferable to attaching subheadings to specific subject headings
  - Example: In MEDLINE, use `Neck Pain/ and su.fs.` rather than `Neck Pain/su`
- Exploding includes all narrower terms in the hierarchy
- Indexing is not always consistent; do not rely solely on subject headings

---

### 4. Text Word Searching (Free Text)

**Purpose**: Assess whether search terms without adequate subject heading coverage are well-represented by free text terms.

#### Checklist
- [ ] Does the search include all spelling variants (e.g., UK vs US: colour/color, randomised/randomized)?
- [ ] Does the search include all synonyms or antonyms (opposites)?
- [ ] Does the search capture relevant truncation (is truncation at the correct place)?
- [ ] Is the truncation too broad or too narrow?
- [ ] Are acronyms or abbreviations used appropriately? Do they capture irrelevant material? Are the full terms also included?
- [ ] Are the keywords specific enough or too broad? Are too many or too few keywords used?
- [ ] Have the appropriate fields been searched (e.g., is the choice of .tw. or .af. appropriate)?
- [ ] Should any long strings be broken into several shorter search statements?

#### Guidance
- Free text complements subject headings for concepts not adequately indexed
- Truncation symbols vary by database:
  - Ovid: `*` or `$`
  - PubMed: `*`
  - EBSCO: `*`
- Wildcards (single character substitution) also vary:
  - Ovid: `?` (1 character), `#` (0 or 1 character)
  - PubMed: none available

#### Field Tags (Ovid)

| Tag | Fields Searched |
|-----|-----------------|
| .tw. | Title + Abstract |
| .ti. | Title only |
| .ab. | Abstract only |
| .mp. | Multiple fields (default) |
| .af. | All fields |

---

### 5. Spelling, Syntax, and Line Numbers

**Purpose**: Assess correct use of spelling, syntax, and search implementation.

#### Checklist
- [ ] Are there any spelling errors?
- [ ] Are there any errors in system syntax (e.g., using a truncation symbol from a different search interface)?
- [ ] Are there incorrect line combinations?
- [ ] Are there orphan lines (lines not referred to in the final summation, which could indicate an error in an AND or OR statement)?

#### Guidance
- Syntax differs between database platforms
- Watch for system syntax errors not easily found by spell-checking
- Verify line numbers and combinations to ensure search logic is correctly implemented
- Note: Ovid is sensitive to spelling variants (randomised vs randomized), while PubMed treats them equivalently

---

### 6. Limits and Filters

**Purpose**: Assess whether the limits used (including filters) are appropriate and have been applied correctly.

#### Checklist
- [ ] Are all limits and filters used appropriately and relevant given the research question?
- [ ] Are all limits and filters appropriate for the database?
- [ ] Are any potentially helpful limits or filters missing? Are they too broad or too narrow?
- [ ] Are sources cited for the filters used?

#### Guidance
- Limits can introduce epidemiological bias if not relevant to eligible study designs
- Use methodological filters cautiously:
  - Do not restrict SRs of economic evaluations to RCTs
  - Diagnostic test accuracy filters may miss relevant studies
- Verify the appropriateness of date limits, language limits, and publication type limits
- Use validated filters from reliable sources (Cochrane, InterTASC, etc.)

---

## Assessment Form

For each element, assign one of the following ratings:

| Rating | Description |
|--------|-------------|
| A. No revisions | No issues identified |
| B. Revision(s) suggested | Improvements possible (optional) |
| C. Revision(s) required | Critical issues identified (must address) |

---

## Information to Include When Submitting a Search Strategy

### Required
- [ ] Systematic Review Title
- [ ] Database (e.g., MEDLINE, CINAHL, Embase)
- [ ] Interface (e.g., Ovid, EBSCO, PubMed)
- [ ] Research Question (purpose of the search)
- [ ] PICO/PECO format description
- [ ] Search strategy with number of hits per line
- [ ] Filter use (yes/no) and source if applicable

### Optional
- Inclusion criteria (age groups, study designs, etc.)
- Exclusion criteria
- Search notes (rationale for inclusion/exclusion of certain terms)

---

## Practical Tips

### To Maximize Recall (Sensitivity)
- Include synonyms, abbreviations, and spelling variants comprehensively
- Use both subject headings AND free text terms
- Use Explode to include narrower concepts
- Use truncation to capture word endings
- Avoid overly restrictive limits or filters

### To Maximize Precision
- Use proximity operators instead of AND to specify word closeness
- Use appropriate subject headings to reduce noise
- Consider field limitations (e.g., title only)
- Use NOT to exclude irrelevant concepts (with caution)

### Common Errors
1. Confusing OR and AND
2. Incorrect nesting with brackets
3. Truncation at wrong position (too short/too long)
4. Forgetting to Explode subject headings
5. Spelling errors (especially medical terminology)
6. Mixing syntax from different databases
7. Line number reference errors

---

## PICO/PECO Framework

| Element | Description | Example |
|---------|-------------|---------|
| **P** (Population/Patient) | Target population | Patients with type 2 diabetes |
| **I** (Intervention/Exposure) | Intervention or exposure | Metformin |
| **C** (Comparison) | Comparator | Placebo |
| **O** (Outcome) | Outcome of interest | Glycemic control |
| **S** (Study design) | Study design (optional) | RCT |

### Notes
- Not all PICO elements need to be included in the search
- Typically search P + I; apply C and O at screening stage
- Adding more elements increases precision but decreases recall

---

## Database Syntax Comparison

| Feature | Ovid | PubMed | EBSCO |
|---------|------|--------|-------|
| Truncation | * or $ | * | * |
| Wildcard (1 char) | ? | None | ? |
| Phrase search | "..." | "..." | "..." |
| Subject heading | exp / | [MeSH] | (MH) |
| Floating subheading | fs. | [Subheading] | - |
| Proximity | adjN, nearN | None | NN, WN |

---

## Key Resources

- [InterTASC Search Filter Resource](https://sites.google.com/a/york.ac.uk/issg-search-filters-resource/home) - Repository of validated search filters
- [Cochrane Handbook Chapter 4](https://training.cochrane.org/handbook) - Searching for and selecting studies
- [PRESSforum](https://pressforum.pbworks.com) - Peer review community for search strategies

---

## Implementation Strategies

1. **Primary search should be peer reviewed** - Additional review may be needed if findings are significant, translation is complex, or revisions are required
2. **One peer review is acceptable** - A second review may be recommended for complex cases or when required revisions are noted
3. **Peer reviewers should be recognized** - At minimum, acknowledgment in the publication
4. **Turnaround time** - Maximum of 5 working days recommended

---

## Version Information

- This checklist is based on @mcgowan_press_report_2016
- Related article: @mcgowan_press_2016

## References

::: {#refs}
:::

---
references:
- id: mcgowan_press_report_2016
  type: report
  title: "PRESS – Peer Review of Electronic Search Strategies: 2015 Guideline Explanation and Elaboration (PRESS E&E)"
  collection-title: "CADTH Methods and Guidelines"
  publisher: CADTH
  publisher-place: "Ottawa, ON"
  URL: "https://www.cadth.ca/sites/default/files/pdf/CP0015_PRESS_Update_Report_2016.pdf"
  author:
    - family: McGowan
      given: Jessie
    - family: Sampson
      given: Margaret
    - family: Salzwedel
      given: "Douglas M."
    - family: Cogo
      given: Elise
    - family: Foerster
      given: Vicki
    - family: Lefebvre
      given: Carol
  issued:
    date-parts:
      - - 2016
        - 1
  accessed:
    date-parts:
      - - 2026
        - 2
        - 8

- id: mcgowan_press_2016
  type: article-journal
  title: "PRESS Peer Review of Electronic Search Strategies: 2015 Guideline Statement"
  container-title: "Journal of Clinical Epidemiology"
  volume: "75"
  page: "40-46"
  DOI: "10.1016/j.jclinepi.2016.01.021"
  PMID: "27005575"
  ISSN: "0895-4356"
  URL: "https://www.sciencedirect.com/science/article/pii/S0895435616000585"
  author:
    - family: McGowan
      given: Jessie
    - family: Sampson
      given: Margaret
    - family: Salzwedel
      given: "Douglas M."
    - family: Cogo
      given: Elise
    - family: Foerster
      given: Vicki
    - family: Lefebvre
      given: Carol
  issued:
    date-parts:
      - - 2016
        - 7
  accessed:
    date-parts:
      - - 2026
        - 2
        - 8
---
