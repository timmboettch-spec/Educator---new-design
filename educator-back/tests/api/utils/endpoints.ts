/**
 * Centralized API Endpoints
 * Reality Works API - Only Signup endpoint
 */

export const endpoints = {
  // Authentication endpoints
  auth: {
    signup: '/auth/signup',
    login: '/auth/login',
    redeem: '/auth/redeem',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    verifyOtp: '/auth/verify-otp',
    resetPassword: '/auth/reset-password',
    resendOtp: '/auth/resend-otp',
    // dashboard/overview
    dashboard: '/dashboard/overview',
    school: '/schools',
    schoolget: '/schools/user',
    schoolgetbyid: '/schools/',
    schooladmin: '/schools/admin/', // + adminId
    educatorInvite: '/invites/create',
    inviteget: '/invites/',
    educatorget: '/educators/admin',
    classes: '/classes',
    educatorupdate: '/educators',
    studentcreate: '/students',
    batchEmail: '/students/batch-email',
    updatestudentcode: '/students/update-code',
    getstudentbyid: '/students/class/', // + classId
    getstudentuser: '/students/user',
    getemailreport: '/students/email-report',
    simulationscenarios: '/simulations/educators',
    simulationdetails: '/simulations/by-unit/', // + unitId
    simulationlibrary: '/educator-simulations/my-library',
    simulationlibraryadd: '/educator-simulations/add-to-library',
  },

  // School endpoints
  school: {
    create: '/schools',
    get: '/schools/user',
    getById: '/schools/', // + schoolId
    update: '/schools/', // + schoolId
    delete: '/schools/', // + schoolId (DELETE)
    schooldelete: '/schools/', // + schoolId (DELETE)
  },

  // Educator endpoints
  educator: {
    create: '/educators',
    get: '/educators',
    getById: '/educators/', // + educatorId
    update: '/educators/', // + educatorId
    delete: '/educators/', // + educatorId (DELETE)
    educatordelete: '/educators/', // + educatorId (DELETE)
  },

  // Class endpoints
  class: {
    create: '/classes',
    get: '/classes',
    getById: '/classes/', // + classId
    update: '/classes/', // + classId
    delete: '/classes/', // + classId (DELETE)
    classdelete: '/classes/', // + classId (DELETE)
  },

  // Student endpoints
  student: {
    create: '/students',
    get: '/students',
    getByClass: '/students/class/', // + classId
    update: '/students/', // + studentId
    delete: '/students/', // + studentId (DELETE)
    studentdelete: '/students/', // + studentId (DELETE)
    batchEmail: '/students/batch-email',
    updateCode: '/students/update-code',
    login: '/students/login', // GET ?student_id=CODE
    simulationsByCode: '/students/simulations/', // + studentCode
  },

  // Simulation endpoints
  simulation: {
    scenarios: '/simulations/educators',
    details: '/simulations/by-unit/', // + unitId
    myLibrary: '/educator-simulations/my-library',
    addToLibrary: '/educator-simulations/add-to-library',
  },
};

/**
 * Build full API URL from endpoint
 * @param endpoint - The endpoint path
 * @param baseURL - Optional base URL override
 * @returns Full URL
 */
export const buildURL = (endpoint: string, baseURL: string = ''): string => {
  return endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`;
};

export default endpoints;
