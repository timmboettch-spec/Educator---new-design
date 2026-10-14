export const accountLocators = {
  accountLink: 'a[href*="/account"], a:has-text("Account")',
  changePasswordButton: 'button:has-text("Change Password")',
  updatePasswordButton: 'button:has-text("Update Password")',
  oldPasswordInput: 'input[placeholder="Old Password"]',
  newPasswordInput: 'input[placeholder="New Password"]',
  confirmPasswordInput: 'input[placeholder="Confirm Password"]',
  passwordChangedMessage: 'Password changed successfully',
  addSubscriptionButton:
    'button:has-text("Add Subscription"), button:has-text("Add subscription"), button:has-text("Subscribe"), button:has-text("Manage Subscription")',
  redeemCodeInput:
    'input[id^="redeem-"], input[placeholder*="Redeem"], input[name*="redeem"], input[id*="redeem"]',
  // <button class="justify-center whitespace-nowrap ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 py-2 px-7 h-[44px] bg-orange-500 hover:bg-orange-600 rounded-full text-white font-bold text-sm flex items-center gap-2 shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:scale-[1.02] active:scale-95 transition-all" type="submit">Active License<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>
  activesubscriptionbutton:
    'button:has-text("Active License"), button:has-text("Active subscription"), button:has-text("Active Subscription")',
  activateSubscriptionButton:
    'button:has-text("Activate"), button:has-text("Apply"), button:has-text("Submit")',
  subscriptionSuccessMessage: 'Subscription activated successfully',
};
