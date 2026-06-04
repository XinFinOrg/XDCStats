import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { PropagationBin } from '../types';
import { blockPropagationFilter } from '../utils/filters';

interface BlockPropagationChartProps {
  histogram: PropagationBin[];
  avg: number;
}

/**
 * D3-rendered block propagation histogram.
 * x-axis: propagation time (0–10 000 ms)
 * y-axis: percentage of blocks
 * Bars are coloured green → yellow → orange → red by propagation time.
 */
const BlockPropagationChart: React.FC<BlockPropagationChartProps> = ({ histogram, avg }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !histogram || histogram.length === 0) return;

    const el = svgRef.current;
    const totalWidth = el.clientWidth || 400;
    const margin = { top: 10, right: 16, bottom: 36, left: 40 };
    const width = totalWidth - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom;

    // Clear previous render
    d3.select(el).selectAll('*').remove();

    const svg = d3
      .select(el)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, d3.max(histogram, (d) => d.x + d.dx) ?? 10000])
      .range([0, width]);

    const yMax = d3.max(histogram, (d) => d.y) ?? 1;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

    // Bar colour function
    const barColor = (x: number): string => {
      if (x < 1000) return '#29b348';
      if (x < 3000) return '#f5b225';
      if (x < 7000) return '#ffb86c';
      return '#ec536c';
    };

    // Grid lines
    svg
      .append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => '')
          .ticks(4)
      )
      .call((g) => g.select('.domain').remove())
      .call((g) =>
        g
          .selectAll('.tick line')
          .attr('stroke', 'rgba(0,0,0,0.06)')
          .attr('stroke-dasharray', '3')
      );

    // Bars
    svg
      .selectAll('.bar')
      .data(histogram)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(d.x) + 1)
      .attr('y', (d) => yScale(d.y))
      .attr('width', (d) => Math.max(0, xScale(d.x + d.dx) - xScale(d.x) - 1))
      .attr('height', (d) => height - yScale(d.y))
      .attr('fill', (d) => barColor(d.x))
      .attr('fill-opacity', 0.85)
      .append('title')
      .text(
        (d) =>
          `${blockPropagationFilter(d.x)} – ${blockPropagationFilter(d.x + d.dx)}: ${(d.y * 100).toFixed(1)}%`
      );

    // x-axis
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickFormat((v) => blockPropagationFilter(v as number, ''));

    svg
      .append('g')
      .attr('class', 'axis axis--x')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .call((g) => g.select('.domain').attr('stroke', '#dee2e6'))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#dee2e6'))
      .call((g) =>
        g
          .selectAll('.tick text')
          .attr('fill', '#a1a7cc')
          .attr('font-size', '10')
      );

    // y-axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(4)
      .tickFormat((v) => `${((v as number) * 100).toFixed(0)}%`);

    svg
      .append('g')
      .attr('class', 'axis axis--y')
      .call(yAxis)
      .call((g) => g.select('.domain').attr('stroke', '#dee2e6'))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#dee2e6'))
      .call((g) =>
        g
          .selectAll('.tick text')
          .attr('fill', '#a1a7cc')
          .attr('font-size', '10')
      );

    // Average vertical line
    if (avg > 0) {
      svg
        .append('line')
        .attr('x1', xScale(avg))
        .attr('x2', xScale(avg))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#242c6d')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2');

      svg
        .append('text')
        .attr('x', xScale(avg) + 4)
        .attr('y', 12)
        .attr('fill', '#242c6d')
        .attr('font-size', '10')
        .text(`avg ${blockPropagationFilter(avg)}`);
    }
  }, [histogram, avg]);

  return (
    <div
      className="bg-white rounded-xl mb-4 flex flex-col"
      style={{ padding: '16px 20px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="header-title" style={{ marginBottom: 0 }}>Block Propagation</p>
        {avg > 0 && (
          <span className="text-xs font-semibold font-mono text-info">{blockPropagationFilter(avg)}</span>
        )}
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 180, overflow: 'visible' }} />
      {(!histogram || histogram.length === 0) && (
        <p className="text-center text-muted text-sm py-4">Waiting for data…</p>
      )}
    </div>
  );
};

export default BlockPropagationChart;
