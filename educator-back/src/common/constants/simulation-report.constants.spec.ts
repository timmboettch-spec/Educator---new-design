import { SimulationReportSelectorType } from 'src/common/constants';

describe('SimulationReportSelectorType', () => {
  it('has exactly the four selector kinds confirmed for RE-38 bulk review', () => {
    expect(Object.values(SimulationReportSelectorType).sort()).toEqual(
      ['class', 'report', 'simulation', 'student'].sort(),
    );
  });
});
