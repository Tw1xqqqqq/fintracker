import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { WeekBalance } from "../lib/finance";
import { formatMoney } from "../lib/finance";

// ISO yyyy-mm-dd -> "дд.мм" для подписей оси X.
function shortWeek(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}` : iso;
}

const compact = new Intl.NumberFormat("ru-RU", {
  notation: "compact",
  maximumFractionDigits: 1
});

const GREEN = "#2f9e44";
const RED = "#c92a2a";
const BLUE = "#1c7ed6";

type BalanceChartProps = {
  weeks: WeekBalance[];
};

export function BalanceChart({ weeks }: BalanceChartProps) {
  // gapBalance != null только на неделях-разрывах — для красных точек поверх линии.
  const data = weeks.map((week) => ({
    ...week,
    gapBalance: week.isCashGap ? week.balance : null
  }));

  return (
    <div className="panel">
      <h2 className="panel-title">Баланс по неделям</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="#e3e9ee" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={shortWeek}
              tick={{ fontSize: 12 }}
              minTickGap={20}
            />
            <YAxis
              tickFormatter={(value) => compact.format(Number(value))}
              tick={{ fontSize: 12 }}
              width={56}
            />
            <Tooltip
              formatter={(value) => formatMoney(Number(value))}
              labelFormatter={(label) => `Неделя ${shortWeek(String(label))}`}
            />
            <Legend />
            <ReferenceLine y={0} stroke="#adb5bd" />

            <Bar dataKey="incomeActual" name="Доход (факт)" fill={GREEN} maxBarSize={14} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenseActual" name="Расход (факт)" fill={RED} maxBarSize={14} radius={[3, 3, 0, 0]} />

            <Line
              type="monotone"
              dataKey="incomePlan"
              name="Доход (план)"
              stroke={GREEN}
              strokeDasharray="4 3"
              strokeWidth={1}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="expensePlan"
              name="Расход (план)"
              stroke={RED}
              strokeDasharray="4 3"
              strokeWidth={1}
              dot={false}
            />

            <Line
              type="monotone"
              dataKey="balance"
              name="Баланс"
              stroke={BLUE}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
            />
            <Line
              dataKey="gapBalance"
              name="Кассовый разрыв"
              stroke="transparent"
              legendType="none"
              isAnimationActive={false}
              dot={{ r: 4.5, fill: RED, stroke: "#ffffff", strokeWidth: 1.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
