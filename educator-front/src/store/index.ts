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
import classReducer from '../redux/class/ClassRedux';
import DeleteClassReducer from '../redux/class/DeleteClassRedux';
import DeleteclassSimReducer from '../redux/class/DeleteSimulationRedux';
import EmailReportReducer from '../redux/class/EmailReportRedux';
import GetClassReducer from '../redux/class/GetClassRedux';
import GetSimsReducer from '../redux/class/GetSimsRedux';
import PatchClassReducer from '../redux/class/PatchClassRedux';
import PostClassReducer from '../redux/class/PostClassRedux';
import studentEmailAccessReducer from '../redux/class/StudentEmailAccessRedux';
import StudentEmailReportReducer from '../redux/class/StudentEmailReportRedux';
import PutClassSimReducer from '../redux/class/UpdateSimRedux';
import simulationLibraryReducer from '../redux/dashboard/simulationlibrary/GetSimulationRedux';
import studentReducer from '../redux/dashboard/student/StudentRedux';
import DeleteSchoolReducer from '../redux/schools/DeleteSchoolsRedux';
import getSchoolsReducer from '../redux/schools/GetSchoolsRedux';
import PatchSchoolReducer from '../redux/schools/PatchSchoolsRedux';
import PostSchoolReducer from '../redux/schools/PostSchoolsRedux';
import GetEducatorReducer from '../redux/educator/GetEducatorRedux';
import VerifyInviteReducer from '../redux/auth/VerifyInviteRedux';
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
import ProductSimBundleReducer from '../redux/products/simbundle';
import AddToLibraryReducer from '../redux/simulation/AddToLibraryRequestRedux';
import RemoveFromLibraryReducer from '../redux/simulation/RemoveFromLibraryRedux';
import EducatorReportsReducer from '../redux/reports/EducatorReportsRedux';
import NotificationsReducer from '../redux/notifications/NotificationsRedux';
import AdminSimulationsReportReducer from '../redux/dashboard/admin/AdminSimulationsReportRedux';
import SimulationCompletedCountReducer from '../redux/dashboard/admin/SimulationCompletedCountRedux';
import CurrentUserReducer from '../redux/users/GetUserRedux';
import AddEducatorSchoolReducer from '../redux/educator/AddEducatorSchoolRedux';
import RemoveEducatorSchoolReducer from '../redux/educator/RemoveEducatorSchoolRedux';
import lmsReducer from '../redux/lms/LmsRedux';
import syncLmsClassesReducer from '../redux/lms/SyncLmsClassesRedux';
import moodleClassesReducer from '../redux/lms/GetLMSClassRedux';
import TransferClassReducer from '../redux/class/TransferClassRedux';
import GetEducatorClassesReducer from '../redux/class/GetEducatorClassesRedux';
import addToBulkLibrary from '../redux/simulation/AddToBulkLibraryRequestRedux';
import DualRoleSignUpReducer from '../redux/auth/DualRoleSignUpRedux';

export const store = configureStore({
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(loaderMiddleware),
  reducer: {
    Login: loginReducer,
    Logout: logoutReducer,
    SignUp: signupReducer,
    DualRoleSignUp: DualRoleSignUpReducer,
    Redeem: redeemReducer,
    School: getSchoolsReducer,
    Class: classReducer,
    getSchools: getSchoolsReducer,
    PostSchool: PostSchoolReducer,
    DeleteSchool: DeleteSchoolReducer,
    PatchSchool: PatchSchoolReducer,
    SimulationLibrary: simulationLibraryReducer,
    SimulationsByUnit: simulationsByUnitReducer,
    Student: studentReducer,
    AddSimulation: SimulationReducer,
    GetClass: GetClassReducer,
    PostClass: PostClassReducer,
    DeleteClass: DeleteClassReducer,
    PatchClass: PatchClassReducer,
    GetSimsList: GetSimsReducer,
    PutclassSim: PutClassSimReducer,
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
    AddToLibrary:AddToLibraryReducer,
    RemoveFromLibrary: RemoveFromLibraryReducer,
    simsCompletedReports: simulationReportsReducer,
    dashboardOverview: dashboardOverviewReducer,
    loader: loaderReducer,
    allSimulationReports: allSimulationReportsReducer,
    simulationDetail: simulationDetailReducer,
    simulationResolve: simulationResolveReducer,
    ProductSimBundle: ProductSimBundleReducer,
    EducatorReports: EducatorReportsReducer,
    Notifications: NotificationsReducer,
    adminSimulationsReport: AdminSimulationsReportReducer,
    simulationCompletedCount: SimulationCompletedCountReducer,
    currentUser: CurrentUserReducer,
    addEducatorSchool: AddEducatorSchoolReducer,
    removeEducatorSchool: RemoveEducatorSchoolReducer,
    lms: lmsReducer,
    lmsSync: syncLmsClassesReducer,
    moodleClasses: moodleClassesReducer,
    TransferClass: TransferClassReducer,
    GetEducatorClassesForTransfer: GetEducatorClassesReducer,
    addToBulkLibrary: addToBulkLibrary,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
