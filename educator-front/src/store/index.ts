import { configureStore } from '@reduxjs/toolkit';
import { loaderMiddleware } from '../redux/loaderMiddleware';
import DeleteStudentReducer from '../redux/class/Student/DeleteStudentRedux';
import PatchStudentReducer from '../redux/class/Student/PatchStudentRedux';
import PostStudentReducer from '../redux/class/Student/PostStudentRedux';
import BulkPostStudentReducer from '../redux/class/Student/BulkPostStudentRedux';
import UpdateStudentCodeReducer from '../redux/class/Student/UpdateStudentCodeRedux';
import RevokeStudentCodeReducer from '../redux/class/Student/RevokeStudentCodeRedux';
import loginReducer from '../redux/auth/LoginRedux';
import logoutReducer from '../redux/auth/LogoutRedux';
import redeemReducer from '../redux/auth/RedeemRedux';
import signupReducer from '../redux/auth/SignUpRedux';
import DeleteclassSimReducer from '../redux/class/DeleteSimulationRedux';
import EmailReportReducer from '../redux/class/EmailReportRedux';
import GetClassReducer from '../redux/class/GetClassRedux';
import GetSimsReducer from '../redux/class/GetSimsRedux';
import studentEmailAccessReducer from '../redux/class/StudentEmailAccessRedux';
import StudentEmailReportReducer from '../redux/class/StudentEmailReportRedux';
import simulationLibraryReducer from '../redux/dashboard/simulationlibrary/GetSimulationRedux';
import studentReducer from '../redux/dashboard/student/StudentRedux';
import DeleteSchoolReducer from '../redux/schools/DeleteSchoolsRedux';
import getSchoolsReducer from '../redux/schools/GetSchoolsRedux';
import PatchSchoolReducer from '../redux/schools/PatchSchoolsRedux';
import PostSchoolReducer from '../redux/schools/PostSchoolsRedux';
import GetEducatorReducer from '../redux/educator/GetEducatorRedux';
import VerifyInviteReducer from '../redux/auth/VerifyInviteRedux';
import AcceptInviteReducer from '../redux/auth/AcceptInviteRedux';
import MeReducer from '../redux/auth/MeRedux';
import ForgotPasswordReducer from '../redux/auth/ForgotPasswordRedux';
import VerifyOTPReducer from '../redux/auth/VerifyOTPRedux';
import ResendOTPReducer from '../redux/auth/ResendOTPRedux';
import ResetPasswordReducer from '../redux/auth/ResetPasswordRedux';
import CreateEducatorReducer from '../redux/educator/CreateEducatorRedux';
import DeleteEducatorReducer from '../redux/educator/DeleteEducatorRedux';
import UpdateEducatorReducer from '../redux/educator/UpdateEducatorRedux';
import ResendInviteReducer from '../redux/educator/ResendInviteRedux';
import RequestMoreSeatsReducer from '../redux/educator/RequestMoreSeatsRedux';
import RemoveReallocateSeatsReducer from '../redux/educator/RemoveReallocateSeatsRedux';
import SimulationReducer, {
  simulationsByUnitReducer,
} from '../redux/dashboard/simulationlibrary/addsimulationredux';
import simulationCatalogReducer from '../redux/simulation/FetchSimulationCatalogRedux';
import myLibraryReducer from '../redux/simulation/MyLibraryRedux';
import dashboardOverviewReducer from '../redux/dashboard/admin/DashboardOverviewRedux';
import simulationReportsReducer from '../redux/class/SimsCompletedreportsRedux';
import loaderReducer from '../redux/loader/loaderSlice';
import allSimulationReportsReducer from '../redux/simulation/GetSimulationReportsRedux';
import simulationDetailReducer from '../redux/simulation/Simulationdetailredux';
import simulationResolveReducer from '../redux/simulation/SimulationResolveRedux';
import AddToLibraryReducer from '../redux/simulation/AddToLibraryRequestRedux';
import RemoveFromLibraryReducer from '../redux/simulation/RemoveFromLibraryRedux';
import EducatorReportsReducer from '../redux/reports/EducatorReportsRedux';
import NotificationsReducer from '../redux/notifications/NotificationsRedux';
import AdminSimulationsReportReducer from '../redux/dashboard/admin/AdminSimulationsReportRedux';
import SimulationCompletedCountReducer from '../redux/dashboard/admin/SimulationCompletedCountRedux';
import AddEducatorSchoolReducer from '../redux/educator/AddEducatorSchoolRedux';
import RemoveEducatorSchoolReducer from '../redux/educator/RemoveEducatorSchoolRedux';
import lmsReducer from '../redux/lms/LmsRedux';
import googleClassroomReducer from '../redux/lms/GoogleClassroomRedux';
import syncLmsClassesReducer from '../redux/lms/SyncLmsClassesRedux';
import moodleClassesReducer from '../redux/lms/GetLMSClassRedux';
import TransferClassReducer from '../redux/class/TransferClassRedux';
import GetEducatorClassesReducer from '../redux/class/GetEducatorClassesRedux';
import addToBulkLibrary from '../redux/simulation/AddToBulkLibraryRequestRedux';
import removeBulkLibraryReducer from '../redux/simulation/RemoveBulkLibraryRedux';
import DualRoleSignUpReducer from '../redux/auth/DualRoleSignUpRedux';
import { classesApi } from '../redux/api/classes/classesApi';
import { studentsApi } from '../redux/api/students/studentsApi';
import { guidedPathApi } from '../redux/api/guidedPath/guidedPathApi';
import { reportsApi } from '../redux/api/reports/reportsApi';
import { classSimulationsApi } from '../redux/api/classSimulations/classSimulationsApi';
import { myLibraryApi } from '../redux/api/myLibrary/myLibraryApi';
import { sessionResetMiddleware } from '../redux/sessionResetMiddleware';
import classesUiReducer from '../redux/api/classes/classesSlice';

export const store = configureStore({
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .prepend(sessionResetMiddleware.middleware)
      .concat(
        loaderMiddleware,
        classesApi.middleware,
        studentsApi.middleware,
        guidedPathApi.middleware,
        reportsApi.middleware,
        classSimulationsApi.middleware,
        myLibraryApi.middleware
      ),
  reducer: {
    Login: loginReducer,
    Logout: logoutReducer,
    SignUp: signupReducer,
    DualRoleSignUp: DualRoleSignUpReducer,
    Redeem: redeemReducer,
    School: getSchoolsReducer,
    getSchools: getSchoolsReducer,
    PostSchool: PostSchoolReducer,
    DeleteSchool: DeleteSchoolReducer,
    PatchSchool: PatchSchoolReducer,
    SimulationLibrary: simulationLibraryReducer,
    SimulationsByUnit: simulationsByUnitReducer,
    Student: studentReducer,
    AddSimulation: SimulationReducer,
    GetClass: GetClassReducer,
    GetSimsList: GetSimsReducer,
    DeleteClassSim: DeleteclassSimReducer,
    EmailReport: EmailReportReducer,
    StudentEmailReport: StudentEmailReportReducer,
    studentEmailAccess: studentEmailAccessReducer,
    PostStudent: PostStudentReducer,
    BulkPostStudent: BulkPostStudentReducer,
    PatchStudent: PatchStudentReducer,
    DeleteStudent: DeleteStudentReducer,
    UpdateStudentCode: UpdateStudentCodeReducer,
    RevokeStudentCode: RevokeStudentCodeReducer,
    GetEducator: GetEducatorReducer,
    VerifyInvite: VerifyInviteReducer,
    AcceptInvite: AcceptInviteReducer,
    Me: MeReducer,
    ForgotPassword: ForgotPasswordReducer,
    VerifyOTP: VerifyOTPReducer,
    ResendOTP: ResendOTPReducer,
    ResetPassword: ResetPasswordReducer,
    CreateEducator: CreateEducatorReducer,
    DeleteEducator: DeleteEducatorReducer,
    updateEducator: UpdateEducatorReducer,
    ResendInvite: ResendInviteReducer,
    RequestMoreSeats: RequestMoreSeatsReducer,
    RemoveReallocateSeats: RemoveReallocateSeatsReducer,
    simulationCatalog: simulationCatalogReducer,
    myLibrary: myLibraryReducer,
    AddToLibrary: AddToLibraryReducer,
    RemoveFromLibrary: RemoveFromLibraryReducer,
    simsCompletedReports: simulationReportsReducer,
    dashboardOverview: dashboardOverviewReducer,
    loader: loaderReducer,
    allSimulationReports: allSimulationReportsReducer,
    simulationDetail: simulationDetailReducer,
    simulationResolve: simulationResolveReducer,
    EducatorReports: EducatorReportsReducer,
    Notifications: NotificationsReducer,
    adminSimulationsReport: AdminSimulationsReportReducer,
    simulationCompletedCount: SimulationCompletedCountReducer,
    addEducatorSchool: AddEducatorSchoolReducer,
    removeEducatorSchool: RemoveEducatorSchoolReducer,
    lms: lmsReducer,
    GoogleClassroom: googleClassroomReducer,
    lmsSync: syncLmsClassesReducer,
    moodleClasses: moodleClassesReducer,
    TransferClass: TransferClassReducer,
    GetEducatorClassesForTransfer: GetEducatorClassesReducer,
    addToBulkLibrary: addToBulkLibrary,
    removeBulkLibrary: removeBulkLibraryReducer,
    [classesApi.reducerPath]: classesApi.reducer,
    [studentsApi.reducerPath]: studentsApi.reducer,
    [guidedPathApi.reducerPath]: guidedPathApi.reducer,
    [reportsApi.reducerPath]: reportsApi.reducer,
    [classSimulationsApi.reducerPath]: classSimulationsApi.reducer,
    [myLibraryApi.reducerPath]: myLibraryApi.reducer,
    classesUi: classesUiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
