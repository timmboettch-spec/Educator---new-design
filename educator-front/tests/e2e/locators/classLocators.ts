export const classLocators = {
  // The educator dashboard no longer has a "Manage Classes" button; the sidebar's
  // Class Management link is the way in from there.
  manageClassesButton:
    'button:has-text("Manage Classes"), a:has-text("Manage Classes"), a[href="/classes"]',
  addClassButton: 'button:has-text("Add Class")',
  createClassButton:
    'button:has-text("Create Class"):not([type="submit"]), button[type="submit"]:has-text("Create Class")',
  classNameInput: 'input[name="class_name"]',
  termInput: 'input[name="term"]',
  selectYearButton: 'button:has-text("Select Year")',
  yearOption2026: 'div[class*="cursor-pointer"]:has-text("2026")',
  startDateInput: 'input[placeholder="MM-DD-YYYY"] >> nth=0',
  endDateInput: 'input[placeholder="MM-DD-YYYY"] >> nth=1',
  // statusSelectButton: 'div:has-text("Status") button:has-text("Select")',
  statusSelectButton: 'div:has-text("Status") button',
  statusActiveOption: 'div:has-text("Status") div:has-text("Active")',
  studentCountInput:
    'input[name="total_no_of_students"], input[placeholder*="Number of Students"]',
  classCreatedToast:
    '[role="status"]:has-text("Class created"), .toast:has-text("Class created"), text=/Class created|successfully/',
  classManagementLink: 'a:has-text("Class Management")',
  viewButton: 'button.text-primary-500',
  menuToggleButton: 'button:has(span.bg-gray-500)',
  studentMenuButton: 'button:has(span.bg-gray-500)',
  editClassDetailsButton: 'button:text-is("Edit Class Details")',
  editStudentDetailsButton: 'button:text-is("Edit Student Details")',
  studentEmailInput: 'input[placeholder="abc@gmail.com"]',
  studentNameInput: 'input[placeholder="Enter student name"]',
  addStudentButton: 'button:has-text("Add Student"):not([type="submit"])',
  createStudentButton: 'button:has-text("Create Student"):not([type="submit"])',
  updateStudentButton: 'button:has-text("Update Student")',
  backButton: 'button:has-text("Back")',
  statusDropdown: 'button:has-text("Select")',
};
