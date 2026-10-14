export const educatorLocators = {
  educatorLink: 'a[href="/educators"], a:has-text("Educators")',
  addEducatorButton:
    'button:has-text("Add Educator"), button:has-text("Create Educator"), button[class*="bg-gradient"]:has-text("Add Educator"), button[class*="bg-gradient"]:has-text("Create Educator")',
  createEducatorHeading:
    'h2:has-text("Create Educator"), h2:has-text("Add Educator")',
  nameInput: 'input[name="full_name"]',
  emailInput: 'input[name="email"]',
  tokenInput: 'input[name="tokens"]',
  selectSchoolButton:
    'button:has-text("Select school"), input[placeholder*="Select school" i]',
  schoolOption: '[role="option"]',
  statusDropdown:
    '[role="dialog"] button[type="button"]:has-text("Pending"), [role="dialog"] button[type="button"]:has-text("Active"), [role="dialog"] button[type="button"]:has-text("Inactive"), [role="dialog"] button[type="button"]:has-text("Select status")',
  seatInput: 'input[placeholder="Enter Educator seats"]',
  submitButton:
    'button[type="submit"][form="educator-form"]:has-text("Create Educator"), button[type="submit"]:has-text("Create Educator"), button[type="submit"]:has-text("Update Educator"), button[type="submit"]:has-text("Update"), button[type="submit"]:has-text("Create"), form[id*="educator" i] button[type="submit"], form button[type="submit"]',
  rowEditButton:
    'button[aria-label="edit"], button:has(svg.lucide-square-pen), button:has-text("Edit")',
  rowViewButton: 'button[aria-label="view"], button:has-text("View")',
  rowDeleteButton:
    'button[aria-label="Yes"], button:has(svg.lucide-trash), button:has(svg.lucide-trash-2), button:has-text("Delete"), svg.lucide-trash, svg.lucide-trash-2',
};
