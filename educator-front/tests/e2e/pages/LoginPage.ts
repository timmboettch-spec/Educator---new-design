import { commonLocators } from '../locators/commonLocators';
import { BASE_URL } from '../config/playwright.smoke.config';
import { performLogin, performLoginWithRedeem } from '../auth/login';
import { logout as logoutAction } from '../auth/logout';
import { readJsonFixture, writeJsonFixture } from '../utils/commonUtils';
import { AccountPage } from './AccountPage';
import { EducatorPage } from './EducatorPage';
import { SchoolPage } from './SchoolPage';
import { ClassPage } from './ClassPage';
import { BasePage } from './base/BasePage';
import adminUser from '../fixtures/user.json' with { type: 'json' };

export class SignupPage extends BasePage {
  latestUser!: { email: string; password: string };

  async openSignup(baseUrl: string): Promise<void> {
    await this.navigateTo(baseUrl);
    await this.click(commonLocators.signUpButton);
    await this.waitForUrl(/signup/i);
    await this.waitForVisible(commonLocators.fullNameInput);
  }

  async submitSignupForm(data: {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }): Promise<void> {
    if (data.fullName !== undefined) {
      await this.fill(commonLocators.fullNameInput, data.fullName);
    }
    if (data.email !== undefined) {
      await this.fill(commonLocators.emailInput, data.email);
    }
    if (data.password !== undefined) {
      await this.fill(commonLocators.passwordInput, data.password);
    }
    if (data.confirmPassword !== undefined) {
      await this.fill(
        commonLocators.confirmPasswordInput,
        data.confirmPassword
      );
    }

    await this.click(commonLocators.signUpButton);
  }

  async hasPostSignupMessage(): Promise<boolean> {
    return this.page
      .getByText(/verification|success|confirm/i)
      .first()
      .isVisible()
      .catch(() => false);
  }

  async isOnSignupPage(): Promise<boolean> {
    return this.page.url().includes('signup');
  }

  async goto(): Promise<void> {
    await this.navigateTo(`${BASE_URL}`);
    await this.click(commonLocators.signUpButton);
    await this.waitForUrl(/signup/i);

    await this.click(commonLocators.signUpButton);
    await this.expectTextVisible('Full name is required');
    await this.page.waitForTimeout(2000);
    await this.page.reload();
    await this.waitForVisible(commonLocators.fullNameInput);
    await this.fill(commonLocators.fullNameInput, '1');
    await this.click(commonLocators.signUpButton);
    await this.expectTextVisible('Email is required');
    await this.page.waitForTimeout(2000);
    await this.page.reload();
    await this.waitForVisible(commonLocators.fullNameInput);
    await this.fill(commonLocators.fullNameInput, 'Test');
    await this.fill(commonLocators.emailInput, 'invalidemail@gmail.com');
    await this.click(commonLocators.signUpButton);
    await this.expectTextVisible('Password is required');
    await this.page.waitForTimeout(2000);
    await this.page.reload();
    await this.waitForVisible(commonLocators.fullNameInput);
    await this.fill(commonLocators.fullNameInput, 'Test User');
    await this.fill(commonLocators.emailInput, 'testuser@example.com');
    await this.fill(commonLocators.passwordInput, 'Test@123');
    await this.fill(commonLocators.confirmPasswordInput, 'Test@1234');
    await this.click(commonLocators.signUpButton);
    await this.expectTextVisible(
      'Password and confirm password must be the same'
    );
    await this.page.waitForTimeout(2000);
    await this.page.reload();
    await this.waitForVisible(commonLocators.fullNameInput);

    const name = BASE_URL;
    await this.fill(commonLocators.fullNameInput, name);
    const password = adminUser.password;
    const email = `testuser${Date.now()}@example.com`;
    await this.fill(commonLocators.emailInput, email);
    await this.fill(commonLocators.passwordInput, password);
    await this.fill(commonLocators.confirmPasswordInput, password);
    await this.click(commonLocators.signUpButton);
    await this.waitForUrl(/login/i);
    await this.page.waitForTimeout(5000);

    this.latestUser = { email, password };
    writeJsonFixture('user.json', { email, password });
  }

  // Positive-only signup flow for smoke tests (minimal validations)
  async signupPositive(): Promise<void> {
    await this.navigateTo(`${BASE_URL}`);
    await this.click(commonLocators.signUpButton);
    await this.waitForUrl(/signup/i);

    const name = BASE_URL;
    await this.waitForVisible(commonLocators.fullNameInput);
    await this.fill(commonLocators.fullNameInput, name);
    const password = adminUser.password;
    const email = `smokeuser${Date.now()}@example.com`;
    await this.fill(commonLocators.emailInput, email);
    await this.fill(commonLocators.passwordInput, password);
    await this.fill(commonLocators.confirmPasswordInput, password);
    await Promise.all([
      this.page.waitForURL(/login/i, { timeout: 30000 }),
      this.click(commonLocators.signUpButton),
    ]);

    this.latestUser = { email, password };
    writeJsonFixture('user.json', { email, password });
  }

  async getCredentials() {
    return this.latestUser;
  }
}

export class LoginPage extends BasePage {
  async goto(): Promise<void> {
    await this.navigateTo(`${BASE_URL}/login`);
    await this.waitForVisible(commonLocators.emailInput);

    readJsonFixture<{ email: string; password: string }>('user.json');
  }
  async submitLoginForm(email: string, password: string): Promise<void> {
    await this.fill(commonLocators.emailInput, email);
    await this.fill(commonLocators.passwordInput, password);
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);
  }

  async submitEmptyForm(): Promise<void> {
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);
  }

  async isLoggedIn(): Promise<boolean> {
    return /dashboard/i.test(this.page.url());
  }

  async performInvalidLogin(): Promise<void> {
    await this.fill(commonLocators.emailInput, '');
    await this.fill(commonLocators.passwordInput, '');
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);
    await this.expectTextVisible('Email is required');
  }

  async performInvalidLoginWithWrongCredentials(): Promise<void> {
    await this.fill(commonLocators.emailInput, 'invalid@example.com');
    await this.fill(commonLocators.passwordInput, 'invalidpassword');
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);
    await this.expectTextVisible('Invalid Credentials');
  }

  async emptyemailandvalidpassword(): Promise<void> {
    await this.fill(commonLocators.emailInput, '');
    await this.fill(commonLocators.passwordInput, 'validpassword');
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);
    await this.expectTextVisible('Email is required');
  }

  async emptyPasswordandValidEmail(email: string): Promise<void> {
    await this.fill(commonLocators.emailInput, email);
    await this.fill(commonLocators.passwordInput, '');
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);
    await this.expectTextVisible('Password is required');
  }

  async Aftersigninlogin(email: string, password: string): Promise<void> {
    await performLoginWithRedeem(this.page, email, password);
  }

  async login(email: string, password: string): Promise<void> {
    await performLogin(this.page, email, password);
  }

  async logout(): Promise<void> {
    await logoutAction(this.page);
  }

  async schoolvalidation(): Promise<void> {
    return new SchoolPage(this.page).schoolvalidation();
  }

  async createEducatorInPortal(): Promise<{
    educatorName: string;
    educatorEmail: string;
  }> {
    return new EducatorPage(this.page).createEducatorInPortal();
  }

  async viewandediteducator(): Promise<void> {
    return new EducatorPage(this.page).viewandediteducator();
  }

  async verifyEducatorEmailAndCompleteSignup(
    educatorName: string,
    educatorEmail: string
  ): Promise<void> {
    return new EducatorPage(this.page).verifyEducatorEmailAndCompleteSignup(
      educatorName,
      educatorEmail
    );
  }

  async ForgotPasswordPage(): Promise<void> {
    return new EducatorPage(this.page).ForgotPasswordPage();
  }

  async educatorlogin(): Promise<void> {
    return new EducatorPage(this.page).educatorlogin();
  }

  async classManagementForEducator(): Promise<void> {
    return new ClassPage(this.page).classManagementForEducator();
  }

  async viewandeditclass(): Promise<void> {
    return new ClassPage(this.page).viewandeditclass();
  }

  async accountSettingsForAdmin(): Promise<void> {
    return new AccountPage(this.page).accountSettingsForAdmin();
  }

  async accountSettingsForEducator(): Promise<void> {
    return new EducatorPage(this.page).accountSettingsForEducator();
  }
}

export class ForgotPasswordPage extends BasePage {
  async open(): Promise<void> {
    await this.navigateTo(`${BASE_URL}/login`);
    await this.waitForVisible(commonLocators.forgotPasswordButton);
    await this.click(commonLocators.forgotPasswordButton);
    await this.waitForUrl(/forgot/i, 30000);
    await this.waitForVisible(commonLocators.emailInput);
  }

  async submitWithEmail(email: string): Promise<void> {
    if (email) await this.fill(commonLocators.emailInput, email);
    await this.page
      .getByRole('button', { name: /Send OTP|Send|Submit|Reset/i })
      .first()
      .click();
    await this.page.waitForTimeout(2000);
  }

  async isOnForgotPage(): Promise<boolean> {
    return this.page.url().includes('forgot');
  }
}
