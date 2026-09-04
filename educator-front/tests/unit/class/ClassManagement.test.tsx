import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDispatch = vi.fn();
const STABLE_EMPTY_ARRAY: never[] = [];
const STABLE_EMPTY_OBJECT = {};
const STABLE_STUDENT_CODES = new Set<string>();

vi.mock("react-redux", async () => {
  const actual =
    await vi.importActual<typeof import("react-redux")>("react-redux");
  return { ...actual, useDispatch: () => mockDispatch };
});

vi.mock("../../../src/redux/class/GetClassRedux", () => ({
  FetchClassesRequest: vi.fn(() => ({ type: "class/fetch" })),
  FetchNeedAttentionClasses: vi.fn(() => ({ type: "classes/needAttention" })),
  resetClassListStatus: vi.fn(() => ({
    type: "GetClass/resetClassListStatus",
  })),
  selectClassResponse: (s: unknown) =>
    (s as { GetClass: { responseClass: unknown } }).GetClass.responseClass,
  selectClassStatus: (s: unknown) =>
    (s as { GetClass: { status: string } }).GetClass.status,
  selectClassRemainingTokens: (s: unknown) =>
    (
      s as {
        GetClass?: { responseClass?: { data?: { remaining_tokens?: number } } };
      }
    )?.GetClass?.responseClass?.data?.remaining_tokens ?? 0,
  selectNeedsAttentionById: () => STABLE_EMPTY_OBJECT,
  selectUnreadCountById: () => STABLE_EMPTY_OBJECT,
  selectReportCountsById: () => STABLE_EMPTY_OBJECT,
  selectAllStudentCodes: () => STABLE_STUDENT_CODES,
  selectNeedAttentionByClassId: () => STABLE_EMPTY_OBJECT,
  selectNeedAttentionCount: () => 0,
  selectClasses: (s: unknown) =>
    (s as { GetClass: { responseClass: { data: { classes: unknown[] } } } }).GetClass
      ?.responseClass?.data?.classes ?? STABLE_EMPTY_ARRAY,
}));

vi.mock("../../../src/redux/class/PostClassRedux", () => ({
  PostClassRequest: vi.fn((p) => ({ type: "class/post", payload: p })),
}));

vi.mock("../../../src/redux/class/PatchClassRedux", () => ({
  UpdateClassRequest: vi.fn((p) => ({ type: "class/patch", payload: p })),
}));

vi.mock("../../../src/redux/class/DeleteClassRedux", () => ({
  DeleteClassRequest: vi.fn((id) => ({ type: "class/delete", payload: id })),
  selectDeleteStatus: (s: unknown) =>
    (s as { DeleteClass?: { status: string } })?.DeleteClass?.status ?? "idle",
}));

vi.mock("../../../src/redux/class/GetSimsRedux", () => ({
  FetchSimulationsByClass: vi.fn(() => ({ type: "sims/fetch" })),
  selectSimulationsByClassId: () => () => [],
}));

vi.mock(
  "../../../src/redux/dashboard/simulationlibrary/addsimulationredux",
  () => ({
    clearAddSimulationState: vi.fn(() => ({ type: "sim/clearAdd" })),
  }),
);

vi.mock("../../../src/types/Fileparser", () => ({
  parseFileToStudentArray: vi.fn(),
}));

vi.mock("../../../src/redux/local-db/LocalDbRedux", () => ({
  fetchLocalDbStatus: vi.fn(() => ({ type: "localDb/fetchStatus" })),
  selectIsLocalDbConnected: () => false,
  selectIsLocalDbConfigured: () => false,
}));

vi.mock("../../../src/redux/reports/EducatorReportsRedux", () => ({
  GetEducatorSimulationReports: vi.fn(() => ({ type: "educatorReports/fetch" })),
  selectEducatorReports: () => STABLE_EMPTY_ARRAY,
  selectEducatorReportsStatus: () => "idle",
}));

vi.mock("../../../src/redux/lms/SyncLmsClassesRedux", () => ({
  syncLmsClasses: vi.fn(() => ({ type: "lmsSync/syncClasses" })),
  fetchLiveLmsClasses: vi.fn(() => ({ type: "lmsSync/fetchLive" })),
  selectSyncState: () => "idle",
  selectLastSyncResult: () => null,
  selectLiveRosterByClassName: () => ({}),
}));

vi.mock("../../../src/redux/lms/GetLMSClassRedux", () => ({
  fetchMoodleClasses: vi.fn(() => ({ type: "moodleClasses/fetch" })),
  selectMoodleClasses: () => STABLE_EMPTY_ARRAY,
  selectMoodleClassStatus: () => "idle",
  selectMoodleClassError: () => null,
}));

vi.mock("../../../src/redux/class/SimsCompletedreportsRedux", () => ({
  FetchClassReportCount: vi.fn(() => ({ type: "simulationReports/fetchCountOnly" })),
  GetClassSimulationReports: vi.fn(() => ({ type: "simulationReports/getByClass" })),
}));

vi.mock("../../../src/components/common/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

// Mock ClassFormModal so submit bypasses Yup validation
vi.mock("../../../src/components/class/Classformmodal", () => ({
  default: ({
    isOpen,
    onSubmit,
    onClose,
    modalMode,
  }: {
    isOpen: boolean;
    onSubmit: (...args: unknown[]) => void;
    onClose: () => void;
    modalMode: string;
  }) =>
    isOpen ? (
      <div data-testid="class-form-modal">
        <span>
          {modalMode === "create"
            ? "Create Class"
            : modalMode === "edit"
              ? "Edit Class"
              : "Delete Class"}
        </span>
        <Input placeholder="Enter Class name" />
        <button
          onClick={() =>
            onSubmit(
              {
                class_name: "New Class",
                term: "i",
                year: "2025",
                status: "ACTIVE",
                start_date: "2025-01-01",
                end_date: "2025-06-30",
                total_no_of_students: "",
              },
              null,
              null,
              () => {},
            )
          }
        >
          Submit Form
        </button>
        <button onClick={onClose}>Back</button>
        {modalMode === "delete" && (
          <button onClick={onClose}>Confirm Delete</button>
        )}
      </div>
    ) : null,
}));

vi.mock("../../../src/components/class/PrintAccessCode", () => ({
  default: () => null,
}));
vi.mock("../../../src/components/class/Classrowactions", () => ({
  default: () => null,
}));
vi.mock("../../../src/components/class/ReportSubTable", () => ({
  default: () => null,
}));
vi.mock("../../../src/components/class/Simsubtable", () => ({
  default: () => null,
}));
vi.mock("../../../src/components/class/student/Studentsubtable", () => ({
  default: () => null,
}));
vi.mock("../../../src/components/class/Useclasscolumns", () => ({
  useClassColumns: () => [],
}));

vi.mock("../../../src/components/class/StatusTabs", () => ({
  default: ({
    activeTab,
    onChange,
  }: {
    activeTab: string;
    onChange: (tab: string) => void;
  }) => {
    const tabs = [
      { key: 'all', label: 'All' },
      { key: 'active', label: 'Active' },
      { key: 'draft', label: 'Draft' },
      { key: 'archived', label: 'Archived' },
      { key: 'needAttention', label: 'Need Attention' },
    ];
    return (
      <div>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            data-active={activeTab === key}
          >
            {label}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("../../../src/components/common/ListTable", () => ({
  default: ({
    data,
  }: {
    data: { id: string; class_name: string; status: string }[];
  }) => (
    <table>
      <tbody>
        {(data ?? []).map((row) => (
          <tr key={row.id}>
            <td>{row.class_name}</td>
            <td>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

// ── Store & render helpers ────────────────────────────────────────────────────

const mockClass = {
  id: "cls-1",
  class_name: "Biology 101",
  term: "Term 1",
  year: "2026",
  status: "ACTIVE",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  students: [],
  sims: [],
  reports: 0,
};

const buildStore = (classState: object = {}) =>
  configureStore({
    reducer: {
      GetClass: () => ({
        responseClass: null,
        status: "idle",
        error: null,
        ...classState,
      }),
      GetSimsList: () => ({
        simulationsByClass: {},
        status: "idle",
        error: null,
      }),
      DeleteClass: () => ({ status: "idle" }),
    },
  });

const renderPage = (classState: object = {}) => {
  localStorage.setItem("user", JSON.stringify({ tokens: 100 }));
  return render(
    <Provider store={buildStore(classState)}>
      <MemoryRouter>
        <Classes />
      </MemoryRouter>
    </Provider>,
  );
};

import Classes from "../../../src/pages/class/index";
import Input from "@/components/ui/Input";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Class Management – Success States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  // ── Page rendering ─────────────────────────────────────────────────────────

  describe("Page rendering", () => {
    it("renders Class Management heading", () => {
      renderPage();
      expect(screen.getByText("Class Management")).toBeInTheDocument();
    });

    it("renders Add Class button", () => {
      renderPage();
      expect(
        screen.getByRole("button", { name: /add class/i }),
      ).toBeInTheDocument();
    });

    it("renders search bar", () => {
      renderPage();
      expect(
        screen.getByPlaceholderText("Search classes..."),
      ).toBeInTheDocument();
    });

    it("renders All status tab", () => {
      renderPage();
      expect(screen.getByText("All")).toBeInTheDocument();
    });

    it("renders class row when data is available", () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: "succeeded",
      });
      expect(screen.getByText("Biology 101")).toBeInTheDocument();
    });

    it("renders multiple class rows", () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: "cls-2", class_name: "Chemistry 202" },
            ],
          },
        },
        status: "succeeded",
      });
      expect(screen.getByText("Biology 101")).toBeInTheDocument();
      expect(screen.getByText("Chemistry 202")).toBeInTheDocument();
    });
  });

  // ── Create class success ───────────────────────────────────────────────────

  describe("Create class success", () => {
    const openCreateModal = async () => {
      renderPage();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /add class/i }));
      });
    };

    it("opens Create Class modal on Add Class click", async () => {
      await openCreateModal();
      expect(screen.getByTestId("class-form-modal")).toBeInTheDocument();
    });

    it("renders class name input in create modal", async () => {
      await openCreateModal();
      expect(
        screen.getByPlaceholderText(/enter class name/i),
      ).toBeInTheDocument();
    });

    it("dispatches PostClassRequest on valid form submit", async () => {
      const { PostClassRequest } =
        await import("../../../src/redux/class/PostClassRedux");
      await openCreateModal();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /submit form/i }));
      });
      await waitFor(() => {
        expect(PostClassRequest).toHaveBeenCalled();
      });
    });

    it("does not re-fetch classes after successful creation", async () => {
      const { FetchClassesRequest } =
        await import("../../../src/redux/class/GetClassRedux");
      await openCreateModal();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /submit form/i }));
      });
      expect(FetchClassesRequest).not.toHaveBeenCalled();
    });

    it("closes modal when Back button is clicked", async () => {
      await openCreateModal();
      fireEvent.click(screen.getByRole("button", { name: /back/i }));
      await waitFor(() => {
        expect(
          screen.queryByTestId("class-form-modal"),
        ).not.toBeInTheDocument();
      });
    });

    it("does not dispatch PostClassRequest when Back is clicked", async () => {
      const { PostClassRequest } =
        await import("../../../src/redux/class/PostClassRedux");
      await openCreateModal();
      fireEvent.click(screen.getByRole("button", { name: /back/i }));
      expect(PostClassRequest).not.toHaveBeenCalled();
    });
  });

  // ── Edit class success ─────────────────────────────────────────────────────

  describe("Edit class success", () => {
    it("does not re-fetch classes after successful edit submit", async () => {
      const { FetchClassesRequest } =
        await import("../../../src/redux/class/GetClassRedux");
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: "succeeded",
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /add class/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /submit form/i }));
      });
      expect(FetchClassesRequest).not.toHaveBeenCalled();
    });
  });

  // ── Delete class success ───────────────────────────────────────────────────

  describe("Delete class success", () => {
    it("does not re-fetch classes on mount", async () => {
      const { FetchClassesRequest } =
        await import("../../../src/redux/class/GetClassRedux");
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: "succeeded",
      });
      expect(FetchClassesRequest).not.toHaveBeenCalled();
    });

    it("DeleteClassRequest is not called without user action", async () => {
      const { DeleteClassRequest } =
        await import("../../../src/redux/class/DeleteClassRedux");
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: "succeeded",
      });
      expect(DeleteClassRequest).not.toHaveBeenCalled();
    });
  });

  // ── Search success state ───────────────────────────────────────────────────

  describe("Search success state", () => {
    it("filters classes by search term", () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: "cls-2", class_name: "Chemistry 202" },
            ],
          },
        },
        status: "succeeded",
      });
      fireEvent.change(screen.getByPlaceholderText("Search classes..."), {
        target: { value: "Biology" },
      });
      expect(screen.getByText("Biology 101")).toBeInTheDocument();
    });

    it("shows all classes when search is cleared", () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: "cls-2", class_name: "Chemistry 202" },
            ],
          },
        },
        status: "succeeded",
      });
      const input = screen.getByPlaceholderText("Search classes...");
      fireEvent.change(input, { target: { value: "Biology" } });
      fireEvent.change(input, { target: { value: "" } });
      expect(screen.getByText("Biology 101")).toBeInTheDocument();
      expect(screen.getByText("Chemistry 202")).toBeInTheDocument();
    });
  });

  // ── Status tab success state ───────────────────────────────────────────────

  describe("Status tab filtering", () => {
    it("shows all classes on All tab", () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              {
                ...mockClass,
                id: "cls-2",
                class_name: "Chemistry 202",
                status: "INACTIVE",
              },
            ],
          },
        },
        status: "succeeded",
      });
      fireEvent.click(screen.getByText("All"));
      expect(screen.getByText("Biology 101")).toBeInTheDocument();
      expect(screen.getByText("Chemistry 202")).toBeInTheDocument();
    });

    it("filters to active classes on Active tab", () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              {
                ...mockClass,
                id: "cls-2",
                class_name: "Chemistry 202",
                status: "INACTIVE",
                start_date: "2024-01-01",
                end_date: "2024-06-30",
              },
            ],
          },
        },
        status: "succeeded",
      });
      fireEvent.click(screen.getByText("Active"));
      expect(screen.getByText("Biology 101")).toBeInTheDocument();
      expect(screen.queryByText("Chemistry 202")).not.toBeInTheDocument();
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  describe("Loading state", () => {
    it("renders page without crashing in loading state", () => {
      renderPage({ status: "loading" });
      expect(screen.getByText("Class Management")).toBeInTheDocument();
    });

    it("Add Class button is visible during loading", () => {
      renderPage({ status: "loading" });
      expect(
        screen.getByRole("button", { name: /add class/i }),
      ).toBeInTheDocument();
    });
  });

  // ── Filter panel success state ─────────────────────────────────────────────

  describe("Filter panel", () => {
    it("opens filter panel on filter button click", () => {
      renderPage();
      const filterBtn = screen.getByRole("button", { name: "" });
      fireEvent.click(filterBtn);
      expect(screen.getByText("Apply Filter")).toBeInTheDocument();
    });

    it("keeps filter panel open after Apply Filter click", () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: "succeeded",
      });
      const filterBtn = screen.getByRole("button", { name: "" });
      fireEvent.click(filterBtn);

      // Open the Status dropdown and select a value so the filter guard is satisfied
      fireEvent.click(screen.getByText("Select Status"));
      fireEvent.click(screen.getByRole("option", { name: "Active" }));

      fireEvent.click(screen.getByText("Apply Filter"));
      expect(screen.getByText("Apply Filter")).toBeInTheDocument();
    });
  });
});

// ── Navigation expansion tests ─────────────────────────────────────────────

describe('Report expansion on navigation from Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ data: { classes: [mockClass] } }) });
  });

  it('FetchClassReportCount is not dispatched on mount', async () => {
    const { FetchClassReportCount } = await import(
      '../../../src/redux/class/SimsCompletedreportsRedux'
    );
    renderPage({
      responseClass: { data: { classes: [mockClass] } },
      status: 'succeeded',
    });
    expect(FetchClassReportCount).not.toHaveBeenCalled();
  });

  it('GetClassSimulationReports is NOT called during eager count fetch', async () => {
    const { GetClassSimulationReports } = await import(
      '../../../src/redux/class/SimsCompletedreportsRedux'
    );
    renderPage({
      responseClass: { data: { classes: [mockClass] } },
      status: 'succeeded',
    });
    // Give effects time to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(GetClassSimulationReports).not.toHaveBeenCalled();
  });
});
