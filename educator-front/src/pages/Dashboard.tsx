import type { ScriptableContext } from 'chart.js';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

import RightArrow from '../../public/assets/common/right_arrow.svg';
import AvaliableToken from '../../public/assets/dashboard/available_token.svg';
import Renewals from '../../public/assets/dashboard/calender_icon.svg';
import Sync from '../../public/assets/dashboard/circle_tick.svg';
import Gem from '../../public/assets/dashboard/gem.svg';
import PendingRequets from '../../public/assets/dashboard/graduation.svg';
import HandIcon from '../../public/assets/dashboard/hand_icon.svg';
import License from '../../public/assets/dashboard/license.svg';
import MathStudent from '../../public/assets/dashboard/math_student.svg';
import Package from '../../public/assets/dashboard/package.svg';
import Purchase from '../../public/assets/dashboard/purchase.svg';
import School from '../../public/assets/dashboard/school.svg';
import TokenUsed from '../../public/assets/dashboard/token_consumed.svg';
import PendingInvites from '../../public/assets/dashboard/users.svg';
import wallet from '../../public/assets/dashboard/wallet.svg';
import { Button } from '../components/ui/Button';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function Dashboard() {
  const metrics = [
    {
      title: 'Schools Count',
      value: '12',
      sub: 'Total active schools',
      icon: School,
    },
    {
      title: 'Active Licenses',
      value: '385',
      sub: 'Licenses currently in use',
      icon: License,
    },
    {
      title: 'Available Seats',
      value: '12,500',
      sub: 'Remaining seats for allocation',
      icon: AvaliableToken,
    },
    {
      title: 'Seats Consumed',
      value: '1,820',
      sub: 'Usage trend remains stable',
      icon: TokenUsed,
    },
    {
      title: 'Upcoming Renewals',
      value: '7',
      sub: 'Licenses due in next 30 days',
      icon: Renewals,
    },
  ];

  const heatmapData = {
    labels: Array(12).fill(''),
    datasets: [
      {
        data: [40, 60, 45, 80, 70, 90, 80, 60, 100, 70, 50, 40],
        backgroundColor: (context: ScriptableContext<'bar'>) => {
          const value = context.raw as number;
          return `rgba(239, 117, 47, ${0.3 + (value / 100) * 0.7})`;
        },
        borderRadius: 4,
        barThickness: 16,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { display: false },
    },
  };

  return (
    <div className="p-8 min-h-full font-sans text-text-primary bg-background-primary">
      <h1 className="text-h1 mb-8">District Dashboard</h1>

      {/* Hero Banner */}
      <div className="mb-12 grid grid-cols-page-header items-center relative overflow-hidden w-full min-h-[267px] rounded-[12.14px] bg-gradient-dashboard p-10">
        <div className="max-w-xl z-10">
          <h2 className="text-h1 text-primary-600 leading-tight mb-4">
            Welcome, District Admin!
          </h2>
          <p className="text-text-secondary text-lg font-medium mb-8">
            Get a quick overview of your district's performance and manage your
            resources efficiently.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button className="bg-primary min-w-[132px] h-[40px] rounded-[10px] px-5 flex items-center justify-center gap-2 border-none text-white">
              <img src={Gem} alt="Gem Icon" /> Buy Seats
            </Button>
            <Button
              className="bg-white/40 min-w-[158px] h-[40px] rounded-[10px] px-5 flex items-center justify-center gap-2 text-primary-600 border-none"
              variant="outline"
            >
              <img src={HandIcon} alt="Hand Icon" /> Allocate Seats
            </Button>
          </div>
        </div>

        {/* Right Illustration Area */}
        <div className="hidden lg:flex flex-col items-center justify-center relative z-10 ml-10 text-right">
          <img
            src={MathStudent}
            alt="Math Student"
            className="w-48 h-48 animate-pulse"
          />
          <p className="text-xs font-semibold text-primary-700 opacity-50 italic w-48 mt-4">
            Empowering education, one seat at a time.
          </p>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full blur-3xl -z-10" />
        </div>
      </div>

      {/* Key Metrics Section */}
      <div className="mb-12">
        <h3 className="text-h5 font-bold mb-6">Key Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-metrics gap-4">
          {metrics.map((m, i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-h4 font-bold">{m.value}</h4>
                </div>
                <div className="text-2xl transition-all cursor-default flex items-center justify-center">
                  <img
                    src={m.icon}
                    alt={m.title}
                    className="w-8 h-8 object-contain"
                  />
                </div>
              </div>
              <p className="text-xs text-text-placeholder font-medium leading-tight">
                {m.sub}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Resources Overview Row */}
      <div className="grid grid-cols-1 lg:grid-cols-content gap-8 mb-12">
        {/* Token Inventory Overview */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
          <h3 className="text-h6 font-bold mb-8">Seat Inventory Overview</h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center text-text-secondary">
              <span className="flex items-center gap-3">
                <img src={Purchase} alt="Purchased" /> Purchased
              </span>
              <span className="font-semibold text-text-primary">7,000</span>
            </div>
            <div className="flex justify-between items-center text-text-secondary">
              <span className="flex items-center gap-3">
                <img src={Package} alt="Bundled" /> Bundled
              </span>
              <span className="font-semibold text-text-primary">4,500</span>
            </div>
            <div className="flex justify-between items-center text-text-secondary">
              <span className="flex items-center gap-3">
                <img src={wallet} alt="Free" /> Free
              </span>
              <span className="font-semibold text-text-primary">1,000</span>
            </div>
            <hr className="border-dashed border-gray-200" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-text-placeholder uppercase tracking-widest">
                Total Available
              </span>
              <span className="text-body-lg font-semibold">12,500</span>
            </div>
          </div>
        </div>

        {/* License Lifecycle Progress */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col">
          <h3 className="text-h6 font-semibold mb-1">
            License Lifecycle Progress
          </h3>
          <p className="text-sm mb-10">Active License (2024-2025)</p>

          <div className="mt-auto">
            <div className="w-full h-4 bg-primary-100 rounded-full overflow-hidden mb-4">
              <div className="w-[60%] h-full bg-primary rounded-full transition-all duration-1000"></div>
            </div>
            <p className="text-body-sm text-text-secondary">
              145 days remaining
            </p>
          </div>
        </div>
      </div>

      {/* Final Row */}
      <div className="grid grid-cols-1 lg:grid-cols-content gap-8">
        {/* Heatmap */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
          <h3 className="text-h6 font-semibold mb-1">
            Class Consumption Heatmap
          </h3>
          <p className="text-xs font-semibold text-text-placeholder mb-8">
            Seat usage across classes
          </p>
          <div className="h-32 mb-6">
            <Bar data={heatmapData} options={chartOptions} />
          </div>
          <p className="text-xs text-center text-text-placeholder font-medium border-t pt-4">
            Darker shade indicates higher seat consumption.
          </p>
        </div>

        {/* Educator Accounts Status */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col">
          <h3 className="text-h6 font-semibold mb-8">
            Educator Accounts Status
          </h3>
          <div className="space-y-6 mb-10">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center text-text-secondary">
                <img
                  src={PendingInvites}
                  alt="Pending Invites"
                  className="w-4 h-4 mr-2"
                />
                Pending Invites:
              </div>
              <span className="w-6 h-6 bg-primary-100 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                3
              </span>
            </div>
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center text-text-secondary">
                <img
                  src={PendingRequets}
                  alt="Pending Requests"
                  className="w-4 h-4 mr-2"
                />
                Pending Requests:
              </div>
              <span className="w-6 h-6 bg-primary-100 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                1
              </span>
            </div>
          </div>
          <Button className="mt-auto w-full py-3 font-normal rounded-2xl flex items-center justify-center gap-2 hover:opacity-80 transition-opacity border-none bg-primary/20 text-neutral-800">
            View All{' '}
            <img src={RightArrow} alt="Right Arrow" className="w-4 h-4" />
          </Button>
        </div>

        {/* Canvas Integration */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-10">
            <h3 className="text-h6 font-semibold">Canvas Integration</h3>
            <p className="text-body-sm px-2.5 py-1">Synced</p>
          </div>
          <div className="space-y-6 mb-10">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center">
                <img src={Sync} alt="Synced" className="w-4 h-4 mr-2" />
                <p className="text-body-base font-normal mb-0.5">Last Sync:</p>
              </div>
              <div>
                <p className="text-body-sm">2 hours ago</p>
              </div>
            </div>
          </div>
          <Button className="mt-auto w-full py-3 font-normal rounded-2xl flex items-center justify-center gap-2 hover:opacity-80 transition-opacity border-none bg-primary/25 text-neutral-800">
            View Details{' '}
            <img src={RightArrow} alt="Right Arrow" className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
