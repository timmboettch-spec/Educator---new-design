# Educator App — E2E Automation Framework

Playwright + TypeScript based End-to-End automation framework for the RealityWorks Educator application.

## Quick Start

```bash
npm install
npm run test:smoke
```

## Smoke Test Execution

Run all smoke tests:

```bash
npm run test:smoke
```

Run for Show Report 

```bash
npm run test:e2e:report
```

## Report

After execution, a custom HTML report is automatically generated:

```text
tests/e2e/results/ui-smoke-test-report.html
```

## Smoke Test Coverage

The smoke suite covers:

* Admin Login
* Subscription Activation
* School Creation
* Educator Creation
* Educator Login
* Class Creation

## Configuration

Framework configuration is maintained in:

```text
playwright.config.ts
```

## Tech Stack

* Playwright
* TypeScript
* Node.js
* Mailosaur
* Custom HTML Reporting

## Project Structure

```text
tests/e2e/
├── modules/
├── pages/
├── locators/
├── fixtures/
├── common/
├── auth/
├── reporters/
├── config/
└── results/
```
