import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string; value: string | number; subtitle?: string;
  icon: LucideIcon; color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

const C = { blue: 'bg-blue-100 text-blue-600', green: 'bg-green-100 text-green-600', purple: 'bg-purple-100 text-purple-600', orange: 'bg-orange-100 text-orange-600', red: 'bg-red-100 text-red-600' };

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${C[color]}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}
