import { useNavigate } from "react-router-dom";

interface Props {
  isAdmin: boolean;
  usageRows?: Array<{
    id: string;
    name: string;
    term: string;
    students: number;
  }>;
  seatLabel?: string;
  manageSeatsLabel?: string;
}

export default function SeatConsumptionByClass({
  isAdmin,
  usageRows,
  seatLabel,
  manageSeatsLabel,
}: Props) {
  const navigate = useNavigate();
  const rows = usageRows ?? [];

  if (rows.length === 0) {
    return null;
  }

  const handleManageSeats = (classId: string, students: number) => {
    localStorage.setItem(`seen_sims_${classId}`, String(students));
    navigate("/classes", { state: { classId, expandType: "sims" } });
  };

  return (
    <div className="mt-5 bg-white p-4">
      <div className="space-y-3">
        {rows.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-primary-100 bg-white px-4 py-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-slate-800">
                  {item.name}
                </h4>
                <span className="text-[10px] text-slate-600 bg-gray-100">
                  {item.term}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-[10px] text-slate-400">{seatLabel ?? "Students"}</p>
                <p className="font-semibold text-slate-800">{item.students}</p>
              </div>

              {!isAdmin && (
                <button
                  onClick={() => handleManageSeats(item.id, item.students)}
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-xs text-white hover:bg-primary-600"
                >
                  {manageSeatsLabel ?? "Manage Seats"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
