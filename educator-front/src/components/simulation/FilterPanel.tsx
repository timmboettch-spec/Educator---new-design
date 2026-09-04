import React, { useMemo, useState } from 'react';

import { Button } from '../ui/Button';
import SelectField from '../ui/Select';
import type { Simulation } from '../../redux/dashboard/simulationlibrary/GetSimulationRedux';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: FilterValues) => void;
  onRemove: () => void;
  simulations: Simulation[];
}

export interface FilterValues {
  product: string;
  topic: string;
  unit: string;
  learnerLevel: string;
  difficulty: string;
  duration: string;
}
const toOptions = (arr: string[]) => arr.map((v) => ({ label: v, value: v }));

const FilterPanel: React.FC<FilterPanelProps> = ({
  isOpen,
  onClose,
  onApply,
  onRemove,
  simulations,
}) => {
  const [filters, setFilters] = useState<FilterValues>({
    product: '',
    topic: '',
    unit: '',
    learnerLevel: '',
    difficulty: '',
    duration: '',
  });
  const productOptions = useMemo(
    () => [], // Product filter removed - category no longer sourced from units
    [simulations],
  );

  const topicOptions = useMemo(
    () => [], // Topic filter removed - category no longer sourced from units
    [simulations],
  );

  const levelOptions = useMemo(
    () => [...new Set(simulations.map((s) => s.learnerLevel).filter(Boolean))],
    [simulations],
  );

  const difficultyOptions = useMemo(
    () => [...new Set(simulations.map((s) => s.difficulty).filter(Boolean))],
    [simulations],
  );

  const set = (key: keyof FilterValues) => (val: string) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const handleRemove = () => {
    setFilters({
      product: '',
      topic: '',
      unit: '',
      learnerLevel: '',
      difficulty: '',
      duration: '',
    });
    onRemove();
  };

  if (!isOpen) return null;

  return (
    <div className="relative z-20 mb-4 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">Filter Simulations</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex gap-3 flex-wrap mb-5 overflow-visible">
        <div className="flex-1 min-w-[140px]">
          <SelectField
            label="Product"
            value={filters.product}
            options={toOptions(productOptions)}
            placeholder="Select Product"
            onChange={set('product')}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <SelectField
            label="Product Type"
            value={filters.topic}
            options={toOptions(topicOptions)}
            placeholder="Select Product Type"
            onChange={set('topic')}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <SelectField
            label="Learner Level"
            value={filters.learnerLevel}
            options={toOptions(levelOptions)}
            placeholder="Select Learner Level"
            onChange={set('learnerLevel')}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <SelectField
            label="Difficulty"
            value={filters.difficulty}
            options={toOptions(difficultyOptions)}
            placeholder="Select Difficulty"
            onChange={set('difficulty')}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" className="rounded-xl text-xs" onClick={handleRemove}>
          Remove Filter
        </Button>
        <Button
          variant="default"
          className="rounded-xl text-xs bg-primary-500 hover:bg-primary-600"
          onClick={() => {
            onApply(filters);
          }}
        >
          Apply Filter
        </Button>
      </div>
    </div>
  );
};

export default FilterPanel;
