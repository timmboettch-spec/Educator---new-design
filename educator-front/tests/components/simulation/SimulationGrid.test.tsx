import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SimulationGrid from "../../../src/components/simulation/SimulationGrid";
import type { Simulation } from "../../../src/types/simulation.types";
import Input from "@/components/ui/Input";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../src/components/simulation/Simulationcard", () => ({
  default: ({
    simulation,
    onAssignClass,
    onMoreInfo,
  }: {
    simulation: Simulation;
    onAssignClass: (id: string) => void;
    onMoreInfo: (id: string) => void;
  }) => (
    <div data-testid={`sim-card-${simulation.id}`}>
      <span>{simulation.title}</span>
      <button onClick={() => onAssignClass(simulation.id)}>Assign Class</button>
      <button onClick={() => onMoreInfo(simulation.id)}>More Info</button>
    </div>
  ),
}));

vi.mock("../../../src/components/modal/MyLibraryModal", () => ({
  default: ({
    simulation,
    onClose,
  }: {
    simulation: Simulation;
    onClose: () => void;
  }) => (
    <div data-testid="library-modal">
      <span>{simulation.title}</span>
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

vi.mock("../../../src/components/simulation/table/ActionMenu", () => ({
  default: ({
    id,
    open,
    onToggle,
    onAssignClass,
    onMoreInfo,
  }: {
    id: string;
    open: boolean;
    onToggle: () => void;
    onAssignClass: (id: string) => void;
    onMoreInfo: (id: string) => void;
  }) => (
    <div data-testid={`action-menu-${id}`}>
      <button onClick={onToggle}>Toggle Menu</button>
      {open && (
        <>
          <button onClick={() => onAssignClass(id)}>Assign</button>
          <button onClick={() => onMoreInfo(id)}>More Details</button>
        </>
      )}
    </div>
  ),
}));

vi.mock("../../../src/components/simulation/table/CategoryPill", () => ({
  default: ({ category }: { category: string }) => (
    <span data-testid="category-pill">{category}</span>
  ),
}));

vi.mock("../../../src/components/simulation/table/TablePagination", () => ({
  default: ({
    currentPage,
    totalPages,
    totalItems,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
  }) => (
    <div data-testid="pagination">
      <span data-testid="page-info">
        {currentPage}/{totalPages}
      </span>
      <span data-testid="total-items">{totalItems}</span>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Prev
      </button>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  ),
}));

vi.mock("../../../src/components/common/SortableHeader", () => ({
  default: ({
    label,
    field,
    onSort,
  }: {
    label: string;
    field: string;
    onSort: (field: string) => void;
  }) => <button onClick={() => onSort(field)}>{label}</button>,
}));

vi.mock("../../../src/components/common/SearchBar", () => ({
  SearchBar: ({
    value,
    onSearch,
    placeholder,
  }: {
    value: string;
    onSearch: (value: string) => void;
    placeholder: string;
  }) => (
    <Input
      data-testid="search-bar"
      value={value}
      onChange={(e) => onSearch(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

const makeSim = (overrides: Partial<Simulation> = {}): Simulation => ({
  id: "sim-1",
  title: "Baby Sim Pro",
  unit: "unit-1",
  unit_name: "Unit One",
  duration: "30 min",
  image: "img.png",
  description: "A great simulation",
  assigned: false,
  rating: 4,
  difficulty: "Easy",
  learnerLevel: "Beginner",
  avatarEnabled: true,
  ...overrides,
});

const makeSims = (count: number): Simulation[] =>
  Array.from({ length: count }, (_, i) =>
    makeSim({
      id: `sim-${i + 1}`,
      title: `Simulation ${i + 1}`,
      avatarEnabled: i % 2 === 0,
    }),
  );

const onAssignClass = vi.fn();
const onMoreInfo = vi.fn();

beforeEach(() => {
  mockNavigate.mockClear();
});

import { Provider } from "react-redux";
import { store } from "../../../src/store";

const setup = (simulations: Simulation[], viewMode: "grid" | "list" = "list") =>
  render(
    <Provider store={store}>
      <SimulationGrid
        simulations={simulations}
        viewMode={viewMode}
        onAssignClass={onAssignClass}
        onMoreInfo={onMoreInfo}
      />
    </Provider>,
  );

describe("SimulationGrid – empty state", () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders "No simulations found" when list is empty', () => {
    setup([]);
    expect(screen.getByText("No simulations found")).toBeInTheDocument();
  });

  it("does not render table when list is empty", () => {
    setup([]);
    expect(screen.queryByTestId("search-bar")).not.toBeInTheDocument();
  });

  it("does not render pagination when list is empty", () => {
    setup([]);
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });
});

// list viewMode = table view (search bar, headers, pagination)
describe("SimulationGrid – list view rendering (table)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders search bar in list view", () => {
    setup([makeSim()], "list");
    expect(screen.getByTestId("search-bar")).toBeInTheDocument();
  });

  it("renders search bar with correct placeholder", () => {
    setup([makeSim()], "list");
    expect(
      screen.getByPlaceholderText("Search Simulations..."),
    ).toBeInTheDocument();
  });

  it("renders table heading text", () => {
    setup([makeSim()], "list");
    expect(
      screen.getByText("All simulations available to your organization"),
    ).toBeInTheDocument();
  });

  it("renders column headers: Simulation Name, Product Type, Learner Level, Difficulty", () => {
    setup([makeSim()], "list");
    expect(screen.getByText("Simulation Name")).toBeInTheDocument();
    expect(screen.getByText("Product Type")).toBeInTheDocument();
    expect(screen.getByText("Learner Level")).toBeInTheDocument();
    expect(screen.getByText("Difficulty")).toBeInTheDocument();
  });

  it("renders Action column header", () => {
    setup([makeSim()], "list");
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("renders simulation title in table row", () => {
    setup([makeSim({ title: "Nursing Sim" })], "list");
    expect(screen.getByText("Nursing Sim")).toBeInTheDocument();
  });

  it("renders category pill for each simulation", () => {
    setup([makeSim()], "list");
    expect(screen.getByTestId("category-pill")).toBeInTheDocument();
  });

  it("renders learner level badge", () => {
    setup([makeSim({ learnerLevel: "Intermediate" })], "list");
    expect(screen.getByText("Intermediate")).toBeInTheDocument();
  });

  it("renders difficulty badge", () => {
    setup([makeSim({ difficulty: "Hard" })], "list");
    expect(screen.getByText("Hard")).toBeInTheDocument();
  });

  it("renders dash for missing learner level", () => {
    setup([makeSim({ learnerLevel: "" })], "list");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders pagination component", () => {
    setup([makeSim()], "list");
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });

  it("renders action menu for each row", () => {
    setup([makeSim({ id: "sim-1" })], "list");
    expect(screen.getByTestId("action-menu-sim-1")).toBeInTheDocument();
  });
});

// grid viewMode = card view (SimulationCard components)
describe("SimulationGrid – grid view rendering (cards)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders simulation cards in grid view", () => {
    setup([makeSim({ id: "sim-1" })], "grid");
    expect(screen.getByTestId("sim-card-sim-1")).toBeInTheDocument();
  });

  it("renders all simulation cards in grid view", () => {
    setup(
      [makeSim({ id: "sim-1" }), makeSim({ id: "sim-2", title: "Sim 2" })],
      "grid",
    );
    expect(screen.getByTestId("sim-card-sim-1")).toBeInTheDocument();
    expect(screen.getByTestId("sim-card-sim-2")).toBeInTheDocument();
  });

  it("renders search bar in grid view", () => {
    setup([makeSim()], "grid");
    expect(screen.getByTestId("search-bar")).toBeInTheDocument();
  });

  it("does not render table headers in grid view", () => {
    setup([makeSim()], "grid");
    expect(screen.queryByText("Simulation Name")).not.toBeInTheDocument();
  });

  it("renders simulation title in card", () => {
    setup([makeSim({ title: "Baby Sim Pro" })], "grid");
    expect(screen.getByText("Baby Sim Pro")).toBeInTheDocument();
  });
});

describe("SimulationGrid – search behavior", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters simulations by title match in grid view", () => {
    setup(
      [
        makeSim({ id: "sim-1", title: "Baby Sim Pro" }),
        makeSim({ id: "sim-2", title: "Nursing Sim" }),
      ],
      "grid",
    );
    fireEvent.change(screen.getByTestId("search-bar"), {
      target: { value: "Baby" },
    });
    expect(screen.getByTestId("sim-card-sim-1")).toBeInTheDocument();
    expect(screen.queryByTestId("sim-card-sim-2")).not.toBeInTheDocument();
  });

  it("filters simulations by title match", () => {
    setup(
      [
        makeSim({ id: "sim-1", title: "Baby Sim Pro" }),
        makeSim({ id: "sim-2", title: "Nursing Sim" }),
      ],
      "list",
    );
    fireEvent.change(screen.getByTestId("search-bar"), {
      target: { value: "Baby" },
    });
    expect(screen.getByText("Baby Sim Pro")).toBeInTheDocument();
    expect(screen.queryByText("Nursing Sim")).not.toBeInTheDocument();
  });

  it("filters simulations by title match", () => {
    setup(
      [
        makeSim({ id: "sim-1", title: "Cardiology Basics" }),
        makeSim({ id: "sim-2", title: "Pediatrics Care" }),
      ],
      "list",
    );
    fireEvent.change(screen.getByTestId("search-bar"), {
      target: { value: "Cardiology" },
    });
    expect(screen.getByText("Cardiology Basics")).toBeInTheDocument();
    expect(screen.queryByText("Pediatrics Care")).not.toBeInTheDocument();
  });

  it('shows "No results found" when search has no match', () => {
    setup([makeSim({ title: "Baby Sim Pro" })], "list");
    fireEvent.change(screen.getByTestId("search-bar"), {
      target: { value: "zzz_no_match" },
    });
    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("restores results when search is cleared", () => {
    setup([makeSim({ title: "Baby Sim Pro" })], "list");
    const input = screen.getByTestId("search-bar");
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Baby Sim Pro")).toBeInTheDocument();
  });

  it("is case-insensitive in search", () => {
    setup([makeSim({ title: "Baby Sim Pro" })], "list");
    fireEvent.change(screen.getByTestId("search-bar"), {
      target: { value: "baby sim" },
    });
    expect(screen.getByText("Baby Sim Pro")).toBeInTheDocument();
  });

  it("resets to page 1 when search changes", () => {
    setup(makeSims(8), "list");
    fireEvent.click(screen.getByText("Next"));
    fireEvent.change(screen.getByTestId("search-bar"), {
      target: { value: "Simulation" },
    });
    expect(screen.getByTestId("page-info")).toHaveTextContent("1/");
  });
});

describe("SimulationGrid – sort behavior", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sorts by title ascending on first click", () => {
    setup(
      [
        makeSim({ id: "sim-1", title: "Zebra Sim" }),
        makeSim({ id: "sim-2", title: "Alpha Sim" }),
      ],
      "list",
    );
    fireEvent.click(screen.getByText("Simulation Name"));
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Alpha Sim");
    expect(rows[2]).toHaveTextContent("Zebra Sim");
  });

  it("sorts by title descending on second click", () => {
    setup(
      [
        makeSim({ id: "sim-1", title: "Alpha Sim" }),
        makeSim({ id: "sim-2", title: "Zebra Sim" }),
      ],
      "list",
    );
    fireEvent.click(screen.getByText("Simulation Name"));
    fireEvent.click(screen.getByText("Simulation Name"));
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Zebra Sim");
    expect(rows[2]).toHaveTextContent("Alpha Sim");
  });

  it("clears sort on third click", () => {
    setup([makeSim({ id: "sim-1", title: "Alpha Sim" })], "list");
    fireEvent.click(screen.getByText("Simulation Name"));
    fireEvent.click(screen.getByText("Simulation Name"));
    fireEvent.click(screen.getByText("Simulation Name"));
    expect(screen.getByText("Alpha Sim")).toBeInTheDocument();
  });

  it("resets to page 1 when sort changes", () => {
    setup(makeSims(8), "list");
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Simulation Name"));
    expect(screen.getByTestId("page-info")).toHaveTextContent("1/");
  });
});

describe("SimulationGrid – pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only first 4 items on page 1", () => {
    setup(makeSims(6), "list");
    expect(screen.getByText("Simulation 1")).toBeInTheDocument();
    expect(screen.getByText("Simulation 4")).toBeInTheDocument();
    expect(screen.queryByText("Simulation 5")).not.toBeInTheDocument();
  });

  it("shows items 5-6 on page 2", () => {
    setup(makeSims(6), "list");
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Simulation 5")).toBeInTheDocument();
    expect(screen.getByText("Simulation 6")).toBeInTheDocument();
  });

  it("shows correct total items count", () => {
    setup(makeSims(6), "list");
    expect(screen.getByTestId("total-items")).toHaveTextContent("6");
  });

  it("shows correct page info on page 1", () => {
    setup(makeSims(6), "list");
    expect(screen.getByTestId("page-info")).toHaveTextContent("1/2");
  });

  it("navigates back to page 1 with Prev", () => {
    setup(makeSims(6), "list");
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Prev"));
    expect(screen.getByTestId("page-info")).toHaveTextContent("1/2");
  });

  it("shows single page when items <= 4", () => {
    setup(makeSims(3), "list");
    expect(screen.getByTestId("page-info")).toHaveTextContent("1/1");
  });
});

describe("SimulationGrid – action menu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens action menu on toggle click", () => {
    setup([makeSim({ id: "sim-1" })], "list");
    fireEvent.click(screen.getByText("Toggle Menu"));
    expect(screen.getByText("Assign")).toBeInTheDocument();
    expect(screen.getByText("More Details")).toBeInTheDocument();
  });

  it("calls onAssignClass with correct id from action menu", () => {
    setup(
      [
        makeSim({
          id: "sim-1",
          unit: "unit-1",
          avatarEnabled: true,
        }),
      ],
      "list",
    );
    fireEvent.click(screen.getByText("Toggle Menu"));
    fireEvent.click(screen.getByText("Assign"));
    expect(onAssignClass).toHaveBeenCalledWith("sim-1", "");
  });

  it("navigates to simulation detail when More Details clicked", () => {
    setup([makeSim({ id: "sim-1", title: "Baby Sim Pro" })], "list");
    fireEvent.click(screen.getByText("Toggle Menu"));
    fireEvent.click(screen.getByText("More Details"));
    expect(mockNavigate).toHaveBeenCalledWith("/simulationdetails/sim-1", {
      state: { fromLibrary: true, simulationId: "sim-1" },
    });
  });

  it("navigate is called once when More Details clicked", () => {
    setup([makeSim({ id: "sim-1" })], "list");
    fireEvent.click(screen.getByText("Toggle Menu"));
    fireEvent.click(screen.getByText("More Details"));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("SimulationGrid – assign class (grid/card view)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls onAssignClass with correct args from card", () => {
    setup(
      [
        makeSim({
          id: "sim-1",
          unit: "unit-1",
          avatarEnabled: true,
        }),
      ],
      "grid",
    );
    fireEvent.click(screen.getByText("Assign Class"));
    expect(onAssignClass).toHaveBeenCalledWith("sim-1", "");
  });

  it("navigates to simulation detail when More Info clicked on card", () => {
    setup([makeSim({ id: "sim-1", title: "Baby Sim Pro" })], "grid");
    fireEvent.click(screen.getByText("More Info"));
    expect(mockNavigate).toHaveBeenCalledWith("/simulationdetails/sim-1", {
      state: { fromLibrary: true, simulationId: "sim-1" },
    });
  });

  it("navigate is called once when More Info clicked on card", () => {
    setup([makeSim({ id: "sim-1" })], "grid");
    fireEvent.click(screen.getByText("More Info"));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});
