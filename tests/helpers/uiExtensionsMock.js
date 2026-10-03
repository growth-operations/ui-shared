// Test double for @hubspot/ui-extensions (a peer dependency we never ship).
// Every component becomes a marker factory — (props) => a plain
// { component: <name>, ...props } object — so hook-free components can be
// "rendered" by calling them directly and walking the tree (see ./render.js).
// `hubspot.fetch` / `logger` are shared vi.fns tests can stub per case.
import { vi } from "vitest";

const marker = (name) => {
  function MockComponent(props) {
    return { component: name, ...props };
  }
  MockComponent.displayName = name;
  return MockComponent;
};

export const hubspot = { fetch: vi.fn() };
export const logger = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

export const Accordion = marker("Accordion");
export const Alert = marker("Alert");
export const AutoGrid = marker("AutoGrid");
export const Button = marker("Button");
export const ButtonRow = marker("ButtonRow");
export const Divider = marker("Divider");
export const EmptyState = marker("EmptyState");
export const Flex = marker("Flex");
export const Heading = marker("Heading");
export const Input = marker("Input");
export const LineChart = marker("LineChart");
export const Link = marker("Link");
export const LoadingButton = marker("LoadingButton");
export const LoadingSpinner = marker("LoadingSpinner");
export const ProgressBar = marker("ProgressBar");
export const Select = marker("Select");
export const Statistics = marker("Statistics");
export const StatisticsItem = marker("StatisticsItem");
export const StatusTag = marker("StatusTag");
export const Table = marker("Table");
export const TableBody = marker("TableBody");
export const TableCell = marker("TableCell");
export const TableHead = marker("TableHead");
export const TableHeader = marker("TableHeader");
export const TableRow = marker("TableRow");
export const Tag = marker("Tag");
export const Text = marker("Text");
export const Tile = marker("Tile");
export const ToggleGroup = marker("ToggleGroup");
