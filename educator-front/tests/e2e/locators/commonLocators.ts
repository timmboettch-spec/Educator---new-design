export const commonLocators = {
  emailInput: 'input[name="email"]',
  passwordInput: 'input[name="password"]',
  fullNameInput: 'input[name="full_name"]',
  confirmPasswordInput: 'input[name="confirmPassword"]',
  phoneNumberInput: 'input[name="phone_number"]',
  submitButton: 'button[type="submit"]',
  signInButton: 'button:has-text("sign in")',
  signUpButton: 'button:has-text("Sign Up")',
  forgotPasswordButton: 'button:has-text("Forgot Password?")',
  activeLicenseButton: 'button:has-text("Active License")',
  statusActiveOption: 'div[class*="cursor-pointer"]:has-text("Active")',
  statusInactiveOption: 'div[class*="cursor-pointer"]:has-text("Inactive")',
  selectSchoolOption: 'div.px-3.py-2.cursor-pointer',
  backButton: 'button:has-text("Back")',
  educatorSignupPhoneInput: 'input[name="phoneNumber"]',
  // <button type="button" class="w-full h-[38px] px-3 rounded-xl bg-white text-sm outline-none transition-all flex items-center justify-between border-2 border-gray-300"><span class="text-gray-400">Select</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-500 transition-transform duration-200"><path d="M6 9l6 6 6-6"></path></svg></button>
  // statusDropdown: 'button:has-text("Select")'
};
