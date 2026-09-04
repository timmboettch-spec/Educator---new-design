interface ServerConfig {
  baseURL: string;
}

interface CombinedConfig extends ServerConfig {
  LoginAPI: string;
  SignUpAPI: string;
  DualRoleSignUpAPI: string;
  ForgotPasswordAPI: string;
  ResetPasswordAPI: string;
  VerifyOTPAPI: string;
  ResendOTPAPI: string;
  RedeemAPI: string;
  SchoolAPI: string;
  SchoolUserAPI: string;
  InviteEducatorAPI: string;
  ClassAPI: string;
  ClassBulkCreateAPI: string;
  EducatorAPI: string;
  CreateEducatorAPI: string;
  VerifyInviteAPI: string;
  UpdateEducatorAPI: string;
  DeleteEducatorAPI: string;
  ResendInviteAPI: string;
  SimulationCatalogAPI: string;
  SimulationCatalogDetailAPI: string;
  SimulationCatalogScenariosAPI: string;
  AddToLibraryAPI: string;
  AddToBulkLibraryAPI: string;
  RemoveFromLibraryAPI: string;
  MyLibraryAPI: string;
  LogOutAPI: string;
  SimulationAPI: string;
  SimulationByUnitApi: string;
  ClassUserAPI: string;
  ReportStudentApi: string;
  GetSimulationApi: string;
  PutclassSimsApi: string;
  DeleteclassSimsApi: string;
  StudentEmailReport: string;
  StudentUserAPI: string;
  AccessCodeApi: string;
  StudentAPI: string;
  StudentBulkAPI: string;
  GetEducatorAPI: string;
  UsersAPI: string;
  ChangePasswordAPI: string;
  UpdateProfileAPI: string;
  GetProfilePictureAPI: string;
  RemoveProfilePictureAPI: string;
  DashboardOverviewAPI: string;
  SimulationCompletedCountAPI: string;
  SimsstudentCompletedReport: string;
  SimsclassCompletedReport: string;
  SimulationReportsAPI: string;
  SyncStudentSimulationAPI: string;
  SimulationAdminReportsAPI: string;
  SimulationEducatorReportsAPI: string;
  SimulationReportsBySimulationAPI: string;
  ClassSimulationDropdownAPI: string;
  RemoveProfilePhotoAPI: string;
  RegenerateCodeApi: string;
  LocalDbAPI: string;
  LIVENESS: string;
  READINESS: string;
  ClassesNeedingAttentionAPI: string;
  MarkReportViewedAPI: string;
  ProductAPI: string;
  UserTranscriptAPI: string;
  StudentReportAPI: string;
  StudentAdminReportAPI: string;
  StudentTranscriptLogAPI: string;
  StudentScenarioAPI: string;
  NotificationsAPI: string;
  LtiMetadataAPI: string;
  LmsConfigureAPI: string;
  LmsEducatorConfigAPI: string;
  LmsEducatorConfigureAPI: string;
  LmsMoodleMappedClassesAPI: string;
  LmsProvisionSyncAPI: string;
  LmsMoodleStudentsAPI: string;
  LmsMoodleCoursesAPI: string;
  LiveClassesAPI: string;
  ClassTransferAPI: string;
  RequestSeatsAPI: string;
  RemoveSeatsAPI: string;
  ReallocateSeatsAPI: string;
  SimulationCatalogCombinedAPI: string;
}

function jsonConcat<T, U>(o1: T, o2: U): T & U {
  return { ...o1, ...o2 };
}

export const setServerConfig = (baseUrl: string): CombinedConfig => {
  const server: ServerConfig = {
    baseURL: baseUrl,
  };

  const combine = {
    LoginAPI: `${baseUrl}/api/auth/login`,
    SignUpAPI: `${baseUrl}/api/auth/signup`,
    DualRoleSignUpAPI: `${baseUrl}/api/auth/dual-role-signup`,
    ForgotPasswordAPI: `${baseUrl}/api/auth/forgot-password`,
    ResetPasswordAPI: `${baseUrl}/api/auth/reset-password`,
    VerifyOTPAPI: `${baseUrl}/api/auth/verify-otp`,
    ResendOTPAPI: `${baseUrl}/api/auth/resend-otp`,
    RedeemAPI: `${baseUrl}/api/auth/redeem`,
    LogOutAPI: `${baseUrl}/api/auth/logout`,
    ClassAPI: `${baseUrl}/api/classes`,
    ClassBulkCreateAPI: `${baseUrl}/api/classes/bulk`,
    SchoolAPI: `${baseUrl}/api/schools`,
    SchoolUserAPI: `${baseUrl}/api/schools/user`,
    GetEducatorAPI: `${baseUrl}/api/educators`,
    EducatorAPI: `${baseUrl}/api/educators/admin`,
    InviteEducatorAPI: `${baseUrl}/api/invites/create`,
    CreateEducatorAPI: `${baseUrl}/api/auth/signup`,
    VerifyInviteAPI: `${baseUrl}/api/invites`,
    UpdateEducatorAPI: `${baseUrl}/api/educators`,
    DeleteEducatorAPI: `${baseUrl}/api/educators`,
    ResendInviteAPI: `${baseUrl}/api/educators`,
    SimulationCatalogAPI: `${baseUrl}/api/simulation-catalog/dashboard`,
    SimulationCatalogDetailAPI: `${baseUrl}/api/simulation-catalog`,
    SimulationCatalogScenariosAPI: `${baseUrl}/api/simulation-catalog/scenarios`,
    AddToLibraryAPI: `${baseUrl}/api/educator-simulations/add-to-library`,
    AddToBulkLibraryAPI: `${baseUrl}/api/educator-simulations/add-to-library-bulk`,
    RemoveFromLibraryAPI: `${baseUrl}/api/educator-simulations/remove-from-library`,
    MyLibraryAPI: `${baseUrl}/api/educator-simulations/my-library`,
    SimulationAPI: `${baseUrl}/api/class-simulations`,
    SimulationByUnitApi: `${baseUrl}/api/simulations/unit`,
    ClassUserAPI: `${baseUrl}/api/classes/user`,
    ReportStudentApi: `${baseUrl}/api/students/class`,
    GetSimulationApi: `${baseUrl}/api/class-simulations/class`,
    PutclassSimsApi: `${baseUrl}/api/class-simulations`,
    DeleteclassSimsApi: `${baseUrl}/api/class-simulations`,
    StudentEmailReport: `${baseUrl}/api/students/email-report`,
    StudentUserAPI: `${baseUrl}/api/students/class`,
    AccessCodeApi: `${baseUrl}/api/students/batch-email`,
    StudentAPI: `${baseUrl}/api/students`,
    StudentBulkAPI: `${baseUrl}/api/students/bulk`,
    SimsclassCompletedReport: `${baseUrl}/api/simulation-reports/class`,
    SimsstudentCompletedReport: `${baseUrl}/api/simulation-reports/student`,
    SyncStudentSimulationAPI: `${baseUrl}/api/simulation-reports`,
    SimulationReportsAPI: `${baseUrl}/api/simulation-reports/`,
    SimulationAdminReportsAPI: `${baseUrl}/api/simulation-reports/admin`,
    SimulationEducatorReportsAPI: `${baseUrl}/api/simulation-reports/educator`,
    SimulationReportsBySimulationAPI: `${baseUrl}/api/simulation-reports/simulation`,
    ClassSimulationDropdownAPI: `${baseUrl}/api/class-simulations/class`,
    UsersAPI: `${baseUrl}/api/users`,
    ChangePasswordAPI: `${baseUrl}/api/users/change-password`,
    UpdateProfileAPI: `${baseUrl}/api/users/profile`,
    RemoveProfilePictureAPI: `${baseUrl}/api/users/profile-picture`,
    GetProfilePictureAPI: `${baseUrl}/api/users/profile-picture`,
    DashboardOverviewAPI: `${baseUrl}/api/dashboard/overview`,
    SimulationCompletedCountAPI: `${baseUrl}/api/simulation-reports/stats/monthly`,
    RemoveProfilePhotoAPI: `${baseUrl}/api/users/profile-picture`,
    RegenerateCodeApi: `${baseUrl}/api/students/regenerate-code`,
    LocalDbAPI: `${baseUrl}/api/local-db`,
    LIVENESS: `${baseUrl}/healthz`,
    READINESS: `${baseUrl}/readyz`,
    ClassesNeedingAttentionAPI: `${baseUrl}/api/simulation-reports/classes-needing-attention`,
    MarkReportViewedAPI: `${baseUrl}/api/simulation-reports`,
    ProductAPI:`${baseUrl}/api/Products/bundle`,
    UserTranscriptAPI: `${baseUrl}/api/simulation-reports/user-transcript`,
    StudentReportAPI: `${baseUrl}/api/reports`,
    StudentAdminReportAPI: `${baseUrl}/api/admin/reports`,
    StudentTranscriptLogAPI: `${baseUrl}/api/logs`,
    StudentScenarioAPI: `${baseUrl}/api/scenarios`,
    NotificationsAPI: `${baseUrl}/api/notifications`,
    LtiMetadataAPI: `${baseUrl}/api/lti/metadata`,
    LmsConfigureAPI: `${baseUrl}/api/lms/schools`,
    LmsEducatorConfigAPI: `${baseUrl}/api/lms/educator/config`,
    LmsEducatorConfigureAPI: `${baseUrl}/api/lms/educator/configure`,
    LmsMoodleMappedClassesAPI: `${baseUrl}/api/lms/moodle/mapped-classes`,
    LmsProvisionSyncAPI: `${baseUrl}/api/lms/provision/sync`,
    LmsMoodleStudentsAPI: `${baseUrl}/api/lms/moodle/students`,
    LmsMoodleCoursesAPI: `${baseUrl}/api/lms/moodle/courses`,
    LiveClassesAPI: `${baseUrl}/api/lms/live-classes`,
    ClassTransferAPI: `${baseUrl}/api/class-transfers`,
    RequestSeatsAPI: `${baseUrl}/api/educators/request-seats`,
    RemoveSeatsAPI: `${baseUrl}/api/educators`,
    ReallocateSeatsAPI: `${baseUrl}/api/educators`,
    SimulationCatalogCombinedAPI: `${baseUrl}/api/simulation-catalog/combined`,
  };

  return jsonConcat(server, combine);
};

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

const config = setServerConfig(BASE_URL);

export default config;
