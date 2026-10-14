import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SimulationGradingRubricItemHistory } from 'src/database/entities';

/** Read-only — rows are written exclusively by the DB trigger on simulation_grading_rubric_items. */
@Injectable()
export class SimulationGradingRubricItemHistoryRepository {
  constructor(
    @InjectRepository(SimulationGradingRubricItemHistory)
    private readonly repo: Repository<SimulationGradingRubricItemHistory>,
  ) {}

  async findByRubricItemId(rubricItemId: string): Promise<SimulationGradingRubricItemHistory[]> {
    return this.repo.find({ where: { rubricItemId }, order: { changedAt: 'DESC' } });
  }

  async findBySimulationId(simulationId: string): Promise<SimulationGradingRubricItemHistory[]> {
    return this.repo.find({ where: { simulationId }, order: { changedAt: 'DESC' } });
  }
}
