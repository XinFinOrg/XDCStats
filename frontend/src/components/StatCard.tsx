import React from 'react';

interface StatCardProps {
  title: string;
  value: string | React.ReactNode;
  valueClass?: string;
  icon?: string;
  subtitle?: string;
}

/**
 * Large stat card used in the top rows.
 */
const StatCard: React.FC<StatCardProps> = ({ title, value, valueClass = '', subtitle }) => {
  return (
    <div
      className="bg-white rounded-xl mb-4 flex flex-col"
      style={{
        padding: '20px 24px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
      }}
    >
      <p className="header-title mb-2">{title}</p>
      <span className={`big-details ${valueClass}`}>{value}</span>
      {subtitle && <span className="text-muted text-xs mt-2 block">{subtitle}</span>}
    </div>
  );
};

export default StatCard;
