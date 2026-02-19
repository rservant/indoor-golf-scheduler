# Software Testing Steering Document

**Status:** Authoritative  
**Applies to:** All repositories, services, libraries, and pipelines  
**Audience:** Engineers, Tech Leads, Architects  
**Owner:** Engineering

---

## 1. Purpose

This document defines **how testing is done** in this organization.

Its goal is to:
- Reduce production risk
- Enable safe, frequent change
- Provide fast, reliable feedback
- Establish shared expectations for quality

This document is **normative**.  
Where it uses **MUST**, **MUST NOT**, **SHOULD**, and **MAY**, those words are intentional.

Kiro should treat this document as the **primary source of truth** for testing decisions.

---

## 2. Core Principles

All testing practices MUST follow these principles:

1. **Testing is a development responsibility**  
   Quality is built in, not inspected later.

2. **Fast feedback is more valuable than perfect coverage**  
   Tests must help engineers learn quickly.

3. **Tests are production code**  
   Poor tests are technical debt.

4. **Test behaviour, not implementation**  
   Internal structure may change; behaviour must not.

5. **Automate what must never be forgotten**  
   Anything critical to correctness, security, or safety MUST be automated.

---

## 3. Test Strategy (Mandatory Pyramid)

All systems MUST follow this distribution:

| Layer | Purpose | Expectations |
|------|--------|--------------|
| Unit Tests | Business logic | Fast, isolated, deterministic |
| Integration Tests | Contracts between components | Real dependencies |
| End-to-End Tests | Critical user journeys | Few, stable, production-like |
| Exploratory Testing | Discover unknown risks | Manual, time-boxed |

**Anti-pattern:**  
Using large numbers of UI or E2E tests to compensate for weak unit or integration coverage.

---

## 4. Unit Testing Standards

### Requirements
- Unit tests MUST:
  - Run in milliseconds
  - Be deterministic
  - Have no network, filesystem, or real clock dependencies
- Each test MUST verify a single behaviour
- Test failures MUST clearly explain what broke and why

### Coverage
- New or modified code MUST achieve:
  - **≥ 80% line coverage**
- Critical business logic SHOULD achieve:
  - **≥ 90% branch coverage**

Coverage is a **signal**, not a goal.  
Low-value tests written solely to increase coverage are discouraged.

---

## 5. Integration Testing Standards

Integration tests validate **real contracts**.

### Requirements
- Integration tests MUST:
  - Use real databases, message brokers, or APIs (containerized or sandboxed)
  - Isolate their data
  - Clean up after execution
- Mocks SHOULD be used sparingly and only at system boundaries

### Prohibited
- Shared mutable environments
- Reusing production databases
- Hidden dependencies between tests

---

## 6. End-to-End (E2E) Testing

E2E tests are expensive and fragile.

### Rules
- E2E tests MUST:
  - Cover only **critical user journeys**
  - Run against production-like environments
- E2E tests SHOULD NOT exceed **10–15%** of total tests
- Flaky E2E tests MUST be fixed or removed immediately

**Critical journeys include:**  
Authentication, revenue, data integrity, and regulatory flows.

---

## 7. Test Data Management

### Principles
- Test data MUST be:
  - Minimal
  - Explicit
  - Purpose-built
- Random data MAY be used **only** when seeded and reproducible

### Prohibited
- Using production data in tests
- Tests that depend on execution order
- Shared test data across unrelated tests

---

## 8. CI and Pull Request Expectations

### Required in CI
All pipelines MUST run:
1. Static analysis
2. Unit tests
3. Integration tests
4. Security checks
5. Coverage reporting

### Pull Requests
Every pull request MUST answer:
- What behaviours are newly tested?
- What risks remain untested, and why?
- Do tests fail for the right reason?

Failing or flaky tests MUST be addressed before merge.

---

## 9. Test Ownership and Maintenance

- Engineers own the tests they write
- Teams own test health
- Leads own enforcement and prioritization

Tests that are:
- Flaky
- Slow
- Unreliable
- Hard to understand  

MUST be fixed or removed.

---

## 10. Explicit Anti-Patterns (Forbidden)

The following are not allowed:
- Tests that assert private methods or internal state
- Snapshot tests without semantic assertions
- Mocking everything
- “Happy-path only” tests
- Commented-out or ignored tests

---

## 11. Legacy Code

For legacy systems:

1. Behaviour MUST be captured with characterization tests
2. Refactoring MUST NOT proceed without test protection
3. Coverage improvements SHOULD be incremental and opportunistic

**Rule:**  
No refactor without tests. No tests without understanding.

---

## 12. Continuous Improvement

Testing strategy MUST evolve.

- Post-incident reviews SHOULD identify missing tests
- Test health SHOULD be reviewed regularly
- Low-value tests SHOULD be removed over time

The guiding question is always:

> *“If this fails in production, what test should have caught it?”*

---

## 13. Final Rule

> **If it matters, it must be tested.**  
> **If it is tested, it must be trusted.**  
> **If it is not trusted, it must be fixed or removed.**
