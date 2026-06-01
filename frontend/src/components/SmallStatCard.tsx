import React from 'react';

interface SmallStatCardProps {
  title: string;
  value: string | React.ReactNode;
  valueClass?: string;
  unit?: string;
}

/**
 * Smaller stat display for the second row (active nodes, gas price, etc.)
 */
const SmallStatCard: React.FC<SmallStatCardProps> = ({ title, value, valueClass = '', unit }) => {
  return (
    <div
      className="bg-white rounded-xl mb-4 flex flex-col"
      style={{
        padding: '16px 24px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
      }}
    >
      <p className="header-title mb-2">{title}</p>
      <div className="flex items-baseline gap-1.5 mt-auto">
        <span className={`text-3xl font-light tracking-tight leading-tight ${valueClass}`}>
          {value}
        </span>
        {unit && <span className="text-muted text-sm">{unit}</span>}
      </div>
    </div>
  );
};

export default SmallStatCard;
