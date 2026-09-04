# API Automation 

## Overview

This project contains automated API test scripts for validating the Educator Application backend services.

The framework is built using:

* TypeScript
* Jest
* Supertest
* Custom HTML Reporting

The automation suite covers end-to-end API validation across multiple modules and generates a detailed HTML execution report after test execution.

---

## Features

* Automated API Testing
* Positive and Negative Test Coverage
* Module-Based Test Organization
* Sequential Execution Flow
* Detailed HTML Reporting
* Request and Response Validation
* Execution Statistics and Summary

---

## Technology Stack

| Technology   | Purpose              |
| ------------ | -------------------- |
| TypeScript   | Programming Language |
| Jest         | Test Runner          |
| Supertest    | API Testing          |
| Node.js      | Runtime Environment  |
| HTML Reports | Execution Reporting  |

---

## Project Structure

```text
tests/
└── api/
    ├── modules/
    │   ├── auth/
    │   ├── school/
    │   ├── educator/
    │   ├── dashboard/
    │   ├── users/
    │   ├── class/
    │   ├── student/
    │   └── simulation/
    │
    ├── executor/
    ├── reports/
    ├── test-data/
    └── utils/
```

---

## Modules Covered

* Auth
* School
* Educator
* Dashboard
* User
* Class
* Student
* Simulation

---

## Installation

Install project dependencies:

```bash
npm install
```

---

## Environment Configuration

Update the required environment variables in:

```text
tests/api/.env
```
## Running API Automation

Execute the complete API automation suite:

```bash
npm run test:api
```

Execution Order:

1. Auth
2. School
3. Educator
4. Dashboard
5. User
6. Class
7. Student
8. Simulation
9. Delete

The execution flow is maintained in sequence to satisfy module dependencies.

---

## Viewing HTML Report

Open the latest generated HTML report:

```bash
npm run show-report
```

---

## Report Details

The generated report contains:

* Total Tests Executed
* Passed Tests
* Failed Tests
* Skipped Tests
* Success Rate
* Module-wise Results
* Test Descriptions
* Pass/Fail Details
* Execution Summary

---

## Validation Coverage

The framework validates:

* API Status Codes
* Response Messages
* Response Body Fields
* Authorization Scenarios
* Positive Test Cases
* Negative Test Cases
* Business Logic Validation

---

## Best Practices

* Maintain reusable test data.
* Keep test cases independent wherever possible.
* Avoid hardcoded values.
* Use utility methods for validations.
* Follow module-based organization.

---

## Execution Flow

```text
Auth
  ↓
School
  ↓
Educator
  ↓
Dashboard
  ↓
User
  ↓
Class
  ↓
Student
  ↓
Simulation
  ↓
Delete
```

---

## Author

API Automation Framework for Educator Application Backend.
