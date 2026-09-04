import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Schools from "../../../src/pages/schools/index";
import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";
import Input from "@/components/ui/Input";

// ─── Store hooks ─────────────────────────────────────────────────────────────
const mockDispatch = vi.fn();
const mockSelector = vi.fn();

vi.mock("../../../src/store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: (state: unknown) => unknown) => mockSelector(fn),
}));

// ─── Redux actions ────────────────────────────────────────────────────────────
vi.mock("../../../src/redux/schools/PostSchoolsRedux", () => ({
  PostSchoolRequest: vi.fn(() => ({ type: "schools/post" })),
}));

vi.mock("../../../src/redux/schools/GetSchoolsRedux", () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) => state,
  GetSchoolRequest: vi.fn(() => ({ type: "schools/get" })),
  resetSchools: vi.fn(() => ({ type: "schools/reset" })),
  selectSchoolResponse: (s: unknown) => s,
  selectSchoolStatus: () => "idle",
}));

vi.mock("../../../src/redux/schools/PatchSchoolsRedux", () => ({
  PatchSchoolRequest: vi.fn(() => ({ type: "schools/patch" })),
}));

vi.mock("../../../src/redux/schools/DeleteSchoolsRedux", () => ({
  DeleteSchoolRequest: vi.fn(() => ({ type: "schools/delete" })),
}));

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'educator/get' })),
  selectGetEducatorsData: () => ({ items: [], totalItems: 0, currentPage: 1, totalPages: 1 }),
}));

vi.mock('../../../src/redux/users/GetUserRedux', () => ({
  getCurrentUserRequest: vi.fn(() => ({ type: 'users/get' })),
}));

// ─── Toast ────────────────────────────────────────────────────────────────────
vi.mock("../../../src/components/common/Toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── UI primitives ────────────────────────────────────────────────────────────
vi.mock("../../../src/components/ui/Modal", () => ({
  default: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

vi.mock("../../../src/components/ui/Input", () => ({
  default: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("../../../src/components/ui/Button", () => ({
  Button: ({
    onClick,
    type,
    children,
    variant: _variant,
    className: _className,
  }: {
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <button onClick={onClick} type={type ?? "button"}>
      {children}
    </button>
  ),
}));

// ─── Common components ────────────────────────────────────────────────────────
vi.mock("../../../src/components/common/ListTable", () => ({
  default: () => <div data-testid="list-table">Table</div>,
}));

vi.mock("../../../src/components/common/PageHeader", () => ({
  PageHeader: ({
    title,
    actionButton,
  }: {
    title: string;
    actionButton: React.ReactElement<{ onClick: () => void }>;
  }) => (
    <div>
      <h1>{title}</h1>
      {actionButton}
    </div>
  ),
}));

vi.mock("../../../src/components/common/SearchBar", () => ({
  SearchBar: ({
    value,
    onSearch,
    placeholder,
  }: {
    value: string;
    onSearch: (q: string) => void;
    placeholder?: string;
  }) => (
    <Input
      placeholder={placeholder ?? "search"}
      value={value}
      onChange={(e) => onSearch(e.target.value)}
    />
  ),
}));

vi.mock("../../../src/components/common/SortableHeader", () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("@/components/common/FilterPanel", () => ({
  default: () => <div data-testid="filter-panel">Filter</div>,
}));

// ─── CreateSchoolModal ────────────────────────────────────────────────────────
vi.mock("@/components/modal/CreateSchoolModal", () => ({
  default: ({
    isModalOpen,
    modalMode,
    isDeleting,
    isSubmitting,
    confirmDelete,
    formik,
    setIsModalOpen,
  }: {
    isModalOpen: boolean;
    modalMode: "create" | "view" | "edit" | "delete";
    selectedSchool: unknown;
    isDeleting: boolean;
    isSubmitting: boolean;
    confirmDelete: () => void;
    formik: {
      values: { school_name: string; status: string };
      errors: { school_name?: string; status?: string };
      touched: { school_name?: boolean; status?: boolean };
      handleChange: React.ChangeEventHandler;
      handleBlur: React.ChangeEventHandler;
      handleSubmit: React.FormEventHandler;
      setFieldValue: (field: string, value: unknown) => void;
    };
    setIsModalOpen: (v: boolean) => void;
  }) => {
    if (!isModalOpen) return null;

    if (modalMode === "delete") {
      return (
        <div data-testid="modal">
          <p>Are you sure you want to delete?</p>
          <button onClick={confirmDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Confirm Delete"}
          </button>
          <button onClick={() => setIsModalOpen(false)}>Cancel</button>
        </div>
      );
    }

    return (
      <div data-testid="modal">
        <form onSubmit={formik.handleSubmit}>
          <Input
            name="school_name"
            placeholder="Enter School name"
            value={formik.values.school_name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            disabled={modalMode === "view" || isSubmitting}
          />
          {formik.touched.school_name && formik.errors.school_name && (
            <span data-testid="error-school_name">
              {formik.errors.school_name}
            </span>
          )}

          <select
            name="status"
            value={formik.values.status}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            disabled={modalMode === "view" || isSubmitting}
          >
            <option value="">Select Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          {formik.touched.status && formik.errors.status && (
            <span data-testid="error-status">{formik.errors.status}</span>
          )}

          {modalMode !== "view" && (
            <button
              type="submit"
              data-testid="modal-submit-btn"
              disabled={isSubmitting}
            >
              {modalMode === "create"
                ? isSubmitting
                  ? "Adding..."
                  : "Add School"
                : isSubmitting
                  ? "Saving..."
                  : "Save Changes"}
            </button>
          )}
          <button type="button" onClick={() => setIsModalOpen(false)}>
            Cancel
          </button>
        </form>
      </div>
    );
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wire up mockDispatch so that:
 *  - The FIRST call (GetSchoolRequest on mount) resolves with an empty list.
 *  - ALL subsequent calls (the real action) resolve with `actionResponse`.
 */
const setupDispatch = (actionResponse: Record<string, unknown> = {}) => {
  mockDispatch
    // 1st call → mount GET
    .mockReturnValueOnce({ unwrap: () => Promise.resolve({ data: [] }) })
    // all further calls → the tested action
    .mockReturnValue({ unwrap: () => Promise.resolve(actionResponse) });
};

/**
 * Wire up mockDispatch so that:
 *  - The FIRST call (GetSchoolRequest on mount) resolves with an empty list.
 *  - ALL subsequent calls reject with `error`.
 */
const setupDispatchReject = (error: Record<string, unknown>) => {
  mockDispatch
    .mockReturnValueOnce({ unwrap: () => Promise.resolve({ data: [] }) })
    .mockReturnValue({ unwrap: () => Promise.reject(error) });
};

/** Open the create-school modal and wait for the name input to appear. */
const openCreateModal = async () => {
  // The header "Add School" button is the first one rendered before the modal opens.
  const addButtons = screen.getAllByText(/Add School/i);
  fireEvent.click(addButtons[0]);

  await waitFor(() => {
    expect(
      screen.getByPlaceholderText(/Enter School name/i),
    ).toBeInTheDocument();
  });
};

/** Fill in the school name and status fields inside the open modal. */
const fillForm = (name: string, status = "ACTIVE") => {
  fireEvent.change(screen.getByPlaceholderText(/Enter School name/i), {
    target: { name: "school_name", value: name },
  });

  fireEvent.change(screen.getByRole("combobox"), {
    target: { name: "status", value: status },
  });
};

/**
 * Click the modal's submit button using its data-testid so we never
 * accidentally match the header "Add School" button.
 */
const submitForm = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("modal-submit-btn"));
  });
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Create School - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Provide a logged-in user in localStorage
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(
      JSON.stringify({ id: "1" }),
    );

    // Default dispatch: mount GET resolves; any extra call also resolves empty
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.resolve({ data: [] }),
    });

    // Selector returns an empty school list (items:[] satisfies selectGetEducatorsData destructuring)
    mockSelector.mockReturnValue({ data: [], items: [] });
  });

  const renderSchools = () =>
    render(
      <MemoryRouter>
        <Schools />
      </MemoryRouter>,
    );

  // ── 1. Render ───────────────────────────────────────────────────────────────
  test("renders create school button", () => {
    renderSchools();
    expect(screen.getAllByText(/Add School/i).length).toBeGreaterThan(0);
  });

  // ── 2. Modal opens ──────────────────────────────────────────────────────────
  test("opens create modal on add school click", async () => {
    renderSchools();
    await openCreateModal();

    expect(
      screen.getByPlaceholderText(/Enter School name/i),
    ).toBeInTheDocument();
  });

  // ── 3. Validation errors on empty submit ────────────────────────────────────
  test("shows validation errors on empty submit", async () => {
    renderSchools();
    await openCreateModal();

    const nameInput = screen.getByPlaceholderText(/Enter School name/i);
    const statusSelect = screen.getByRole("combobox");

    fireEvent.blur(nameInput);
    fireEvent.blur(statusSelect);

    await act(async () => {
      fireEvent.submit(nameInput.closest("form")!);
    });

    await waitFor(() => {
      const errors =
        screen.queryAllByTestId("error-school_name").length +
        screen.queryAllByTestId("error-status").length;
      expect(errors).toBeGreaterThan(0);
    });
  });

  // ── 4. Dispatches with valid values ─────────────────────────────────────────
  test("submits with valid name and active status", async () => {
    setupDispatch({ message: "School created successfully" });

    renderSchools();
    await openCreateModal();
    fillForm("Test School");
    await submitForm();

    await waitFor(() => {
      expect(mockDispatch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── 5. Successful creation closes modal and shows success toast ─────────────
  test("successful school creation closes modal and shows success toast", async () => {
    const { toast } = await import("../../../src/components/common/Toast");
    setupDispatch({ message: "School created successfully" });

    renderSchools();
    await openCreateModal();
    fillForm("My School");
    await submitForm();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("School created successfully");
    });

    await waitFor(() => {
      expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
    });
  });

  // ── 6. Duplicate school name shows error toast ──────────────────────────────
  test("shows error when school already exists (resolved with duplicate message)", async () => {
    const { toast } = await import("../../../src/components/common/Toast");
    setupDispatch({ message: "School already exists" });

    renderSchools();
    await openCreateModal();
    fillForm("Duplicate School");
    await submitForm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("School already exists");
    });

    expect(screen.getByTestId("modal")).toBeInTheDocument();
  });

  // ── 7. API failure shows error toast ────────────────────────────────────────
  test("shows toast error on API failure", async () => {
    const { toast } = await import("../../../src/components/common/Toast");
    setupDispatchReject({ message: "Server error" });

    renderSchools();
    await openCreateModal();
    fillForm("Fail School");
    await submitForm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Server error");
    });
  });
});
