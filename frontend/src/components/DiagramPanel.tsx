import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import { GitBranch, Maximize2, Minus, Move, Plus, RotateCcw, Search, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { SQLCatalogColumn, SQLCatalogRelationship, SQLCatalogResponse, SQLCatalogTable } from "../lib/types";
import { cn, formatTableLabel } from "../lib/utils";

type DiagramMode = "focus" | "schema" | "all";

type DiagramPanelProps = {
  catalog?: SQLCatalogResponse;
  loading: boolean;
  error: string;
  selectedTable: string;
  onSelectTable: (table: string) => void;
};

type CatalogTableRef = {
  key: string;
  schema: string;
  table: SQLCatalogTable;
};

type TableMetric = CatalogTableRef & {
  relationshipColumns: Set<string>;
  fkColumns: Set<string>;
  referencedColumns: Set<string>;
  displayColumns: SQLCatalogColumn[];
  hiddenColumns: number;
  height: number;
};

type DiagramEdge = {
  key: string;
  relationship: SQLCatalogRelationship;
  fromKey: string;
  toKey: string;
};

type LayoutSchema = {
  key: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutTable = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metric: TableMetric;
};

type LayoutEdge = DiagramEdge & {
  paths: string[];
  markerPathIndex: number;
};

type DiagramPoint = {
  x: number;
  y: number;
};

type TableSchemaOffset = {
  schema: string;
  x: number;
  y: number;
};

type ElkSection = NonNullable<ElkExtendedEdge["sections"]>[number];

type DiagramLayout = {
  schemas: LayoutSchema[];
  tables: LayoutTable[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

const elk = new ELK({ workerUrl: elkWorkerUrl });
const tableWidth = 260;
const canvasPadding = 36;
const maxVisibleColumns = 7;
const minZoom = 0.35;
const maxZoom = 1.8;
const modeLabels: Record<DiagramMode, string> = {
  focus: "Focus",
  schema: "Schema",
  all: "All",
};

export function DiagramPanel({ catalog, loading, error, selectedTable, onSelectTable }: DiagramPanelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<DiagramMode>("focus");
  const [tableSearch, setTableSearch] = useState("");
  const [hoveredTable, setHoveredTable] = useState("");
  const [hoveredEdge, setHoveredEdge] = useState("");
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [layoutState, setLayoutState] = useState<{ loading: boolean; layout?: DiagramLayout; error: string }>({
    loading: false,
    error: "",
  });

  const allTables = useMemo(() => flattenCatalogTables(catalog), [catalog]);
  const tableByKey = useMemo(() => new Map(allTables.map((table) => [table.key, table])), [allTables]);
  const effectiveSelectedTable = tableByKey.has(selectedTable) ? selectedTable : allTables[0]?.key ?? "";
  const relationships = catalog?.relationships ?? [];

  const diagramModel = useMemo(
    () => buildDiagramModel(allTables, relationships, effectiveSelectedTable, mode),
    [allTables, relationships, effectiveSelectedTable, mode],
  );

  const graph = useMemo(() => buildElkGraph(diagramModel.tables, diagramModel.edges), [diagramModel]);

  const searchResults = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) return [];
    return allTables
      .filter((table) => table.key.toLowerCase().includes(query) || table.table.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [allTables, tableSearch]);

  useEffect(() => {
    if (!graph) {
      setLayoutState({ loading: false, error: "" });
      return;
    }

    let cancelled = false;
    setLayoutState((current) => ({ ...current, loading: true, error: "" }));
    elk
      .layout(graph)
      .then((layoutedGraph) => {
        if (cancelled) return;
        setLayoutState({
          loading: false,
          error: "",
          layout: readElkLayout(layoutedGraph, diagramModel.tablesByKey, diagramModel.edges),
        });
      })
      .catch((layoutError: unknown) => {
        if (cancelled) return;
        setLayoutState({
          loading: false,
          error: layoutError instanceof Error ? layoutError.message : "Could not calculate this diagram layout.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [diagramModel, graph]);

  useEffect(() => {
    setZoom(1);
    requestAnimationFrame(() => centerSelectedTable(viewportRef.current, layoutState.layout, effectiveSelectedTable, 1));
  }, [effectiveSelectedTable, layoutState.layout, mode]);

  if (loading) return <DiagramMessage title="Diagram" text="Loading schema graph..." />;
  if (error) return <DiagramMessage title="Diagram error" text={error} tone="danger" />;
  if (!catalog || allTables.length === 0) return <DiagramMessage title="Diagram" text="No tables found in this database." />;

  const layout = layoutState.layout;
  const selectedSchema = effectiveSelectedTable.split(".")[0] ?? "";
  const zoomPercent = Math.round(zoom * 100);
  const hasEdgeInteraction = Boolean(hoveredTable || hoveredEdge);
  const suppressDefaultEdges = mode === "focus" && diagramModel.edges.length > 4 && !hasEdgeInteraction;

  const setClampedZoom = (nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const viewport = viewportRef.current;
    const clampedZoom = clampZoom(nextZoom);
    if (!viewport) {
      setZoom(clampedZoom);
      return;
    }

    const previousZoom = zoom;
    const rect = viewport.getBoundingClientRect();
    const anchorX = anchor ? anchor.clientX - rect.left : viewport.clientWidth / 2;
    const anchorY = anchor ? anchor.clientY - rect.top : viewport.clientHeight / 2;
    const contentX = (viewport.scrollLeft + anchorX) / previousZoom;
    const contentY = (viewport.scrollTop + anchorY) / previousZoom;

    setZoom(clampedZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = contentX * clampedZoom - anchorX;
      viewport.scrollTop = contentY * clampedZoom - anchorY;
    });
  };

  const zoomBy = (delta: number) => setClampedZoom(zoom + delta);

  const resetZoom = () => {
    setZoom(1);
    requestAnimationFrame(() => centerSelectedTable(viewportRef.current, layout, effectiveSelectedTable, 1));
  };

  const fitDiagram = () => {
    const viewport = viewportRef.current;
    if (!viewport || !layout) return;
    const nextZoom = clampZoom(Math.min((viewport.clientWidth - 48) / layout.width, (viewport.clientHeight - 48) / layout.height, 1));
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (layout.width * nextZoom - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (layout.height * nextZoom - viewport.clientHeight) / 2);
    });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.08 : 0.08;
    setClampedZoom(zoom + direction, { clientX: event.clientX, clientY: event.clientY });
  };

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isInteractiveDiagramTarget(event.target)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsPanning(true);
    viewport.setPointerCapture(event.pointerId);
  };

  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = panStartRef.current.scrollLeft - (event.clientX - panStartRef.current.x);
    viewport.scrollTop = panStartRef.current.scrollTop - (event.clientY - panStartRef.current.y);
  };

  const stopPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setIsPanning(false);
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="data-panel diagram-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-3">
        <div className="flex items-start gap-3">
          <GitBranch size={18} className="mt-1 text-[var(--accent)]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">Diagram</p>
            <h3 className="text-base font-semibold">Live DB relationships</h3>
            <p className="mt-1 text-sm text-muted">
              {diagramModel.tables.length} table(s), {diagramModel.edges.length} relationship(s)
              {mode !== "all" && selectedSchema ? ` around ${mode === "focus" ? effectiveSelectedTable : selectedSchema}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="diagram-segmented" aria-label="Diagram view mode">
            {(Object.keys(modeLabels) as DiagramMode[]).map((item) => (
              <button key={item} type="button" className={cn(mode === item && "active")} onClick={() => setMode(item)}>
                {modeLabels[item]}
              </button>
            ))}
          </div>
          <div className="diagram-zoom-toolbar" aria-label="Diagram zoom controls">
            <button type="button" onClick={() => zoomBy(-0.1)} disabled={zoom <= minZoom} title="Zoom out">
              <Minus size={14} />
            </button>
            <span>{zoomPercent}%</span>
            <button type="button" onClick={() => zoomBy(0.1)} disabled={zoom >= maxZoom} title="Zoom in">
              <Plus size={14} />
            </button>
            <button type="button" onClick={fitDiagram} disabled={!layout} title="Fit diagram">
              <Maximize2 size={14} />
            </button>
            <button type="button" onClick={resetZoom} disabled={!layout} title="Reset zoom">
              <RotateCcw size={14} />
            </button>
          </div>
          <label className="relative flex h-10 w-[270px] max-w-full items-center gap-2 border border-line bg-[var(--bg)] px-3 text-sm text-muted">
            <Search size={15} />
            <input
              aria-label="Find diagram table"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Focus table..."
              className="w-full bg-transparent outline-none placeholder:text-[var(--text-dim)]"
            />
          </label>
        </div>
      </div>

      {searchResults.length > 0 ? (
        <div className="diagram-search-results border-b border-line px-3 py-2">
          {searchResults.map((table) => (
            <button
              key={table.key}
              type="button"
              onClick={() => {
                onSelectTable(table.key);
                setMode("focus");
                setTableSearch("");
              }}
            >
              <Table2 size={14} />
              <span>{table.key}</span>
            </button>
          ))}
        </div>
      ) : null}

      {layoutState.loading ? <DiagramMessage title="Arranging graph" text="Calculating readable schema groups..." compact /> : null}
      {layoutState.error ? <DiagramMessage title="Layout error" text={layoutState.error} tone="danger" compact /> : null}

      {layout ? (
        <div
          ref={viewportRef}
          className={cn("diagram-canvas-shell", isPanning && "panning")}
          onWheel={handleWheel}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
        >
          <div className="diagram-canvas-spacer" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
            <div
              className="diagram-canvas"
              style={{
                width: layout.width,
                height: layout.height,
                transform: `scale(${zoom})`,
              }}
            >
              <svg className="diagram-edges" width={layout.width} height={layout.height} role="img" aria-label="Foreign key relationships">
                <defs>
                  <marker id="diagram-arrow-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                    <path className="diagram-arrow-active" d="M 0 0 L 7 3.5 L 0 7 z" />
                  </marker>
                </defs>
                {layout.edges.map((edge) => {
                  const active = !suppressDefaultEdges && isRelationshipActive(edge, effectiveSelectedTable, hoveredTable, hoveredEdge);
                  const dimmed = !active && Boolean(hoveredTable || hoveredEdge);
                  const hidden = suppressDefaultEdges;
                  return edge.paths.map((path, pathIndex) => (
                    <path
                      key={`${edge.key}:${pathIndex}`}
                      d={path}
                      className={cn("diagram-edge", active && "active", dimmed && "dimmed", hidden && "hidden")}
                      markerEnd={active && pathIndex === edge.markerPathIndex ? "url(#diagram-arrow-active)" : undefined}
                      onMouseEnter={() => setHoveredEdge(edge.key)}
                      onMouseLeave={() => setHoveredEdge("")}
                    >
                      <title>{relationshipTitle(edge.relationship)}</title>
                    </path>
                  ));
                })}
              </svg>

              {layout.schemas.map((schema) => (
                <div
                  key={schema.key}
                  className="diagram-schema-box"
                  style={{
                    left: schema.x + canvasPadding,
                    top: schema.y + canvasPadding,
                    width: schema.width,
                    height: schema.height,
                  }}
                >
                  <span>{schema.name}</span>
                </div>
              ))}

              {layout.tables.map((table) => (
                <DiagramTableCard
                  key={table.key}
                  table={table}
                  selected={table.key === effectiveSelectedTable}
                  related={isTableRelated(table.key, effectiveSelectedTable, diagramModel.edges)}
                  onSelect={() => onSelectTable(table.key)}
                  onHover={setHoveredTable}
                />
              ))}

            </div>
          </div>
          <div className="diagram-pan-hint">
            <Move size={13} />
            <span>Drag to pan, Cmd/Ctrl + wheel to zoom</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function flattenCatalogTables(catalog?: SQLCatalogResponse): CatalogTableRef[] {
  if (!catalog) return [];
  return catalog.schemas.flatMap((schema) =>
    schema.tables.map((table) => ({
      key: tableKey(schema.name, table.name),
      schema: schema.name,
      table,
    })),
  );
}

function buildDiagramModel(
  allTables: CatalogTableRef[],
  relationships: SQLCatalogRelationship[],
  selectedTable: string,
  mode: DiagramMode,
) {
  const allTableKeys = new Set(allTables.map((table) => table.key));
  const selectedSchema = selectedTable.split(".")[0] ?? "";
  const visibleKeys = new Set<string>();

  if (mode === "all") {
    allTables.forEach((table) => visibleKeys.add(table.key));
  } else if (mode === "schema") {
    allTables.filter((table) => table.schema === selectedSchema).forEach((table) => visibleKeys.add(table.key));
    relationships.forEach((relationship) => {
      const fromKey = endpointKey(relationship.from);
      const toKey = endpointKey(relationship.to);
      if (relationship.from.schema === selectedSchema || relationship.to.schema === selectedSchema) {
        if (allTableKeys.has(fromKey)) visibleKeys.add(fromKey);
        if (allTableKeys.has(toKey)) visibleKeys.add(toKey);
      }
    });
  } else {
    if (selectedTable) visibleKeys.add(selectedTable);
    relationships.forEach((relationship) => {
      const fromKey = endpointKey(relationship.from);
      const toKey = endpointKey(relationship.to);
      if (fromKey === selectedTable || toKey === selectedTable) {
        if (allTableKeys.has(fromKey)) visibleKeys.add(fromKey);
        if (allTableKeys.has(toKey)) visibleKeys.add(toKey);
      }
    });
  }

  const visibleEdges = relationships
    .map((relationship, index) => ({
      key: `${relationship.name}:${endpointKey(relationship.from)}:${endpointKey(relationship.to)}:${index}`,
      relationship,
      fromKey: endpointKey(relationship.from),
      toKey: endpointKey(relationship.to),
    }))
    .filter((edge) => {
      if (!visibleKeys.has(edge.fromKey) || !visibleKeys.has(edge.toKey)) return false;
      if (mode === "focus") return edge.fromKey === selectedTable || edge.toKey === selectedTable;
      return true;
    });

  const relationshipColumns = new Map<string, Set<string>>();
  const fkColumns = new Map<string, Set<string>>();
  const referencedColumns = new Map<string, Set<string>>();
  for (const key of visibleKeys) {
    relationshipColumns.set(key, new Set());
    fkColumns.set(key, new Set());
    referencedColumns.set(key, new Set());
  }
  visibleEdges.forEach((edge) => {
    addColumns(relationshipColumns.get(edge.fromKey), edge.relationship.from.columns);
    addColumns(relationshipColumns.get(edge.toKey), edge.relationship.to.columns);
    addColumns(fkColumns.get(edge.fromKey), edge.relationship.from.columns);
    addColumns(referencedColumns.get(edge.toKey), edge.relationship.to.columns);
  });

  const tables = allTables
    .filter((table) => visibleKeys.has(table.key))
    .map((table) => {
      const relationSet = relationshipColumns.get(table.key) ?? new Set<string>();
      const orderedColumns = [
        ...table.table.columns.filter((column) => relationSet.has(column.name)),
        ...table.table.columns.filter((column) => column.isPrimaryKey && !relationSet.has(column.name)),
        ...table.table.columns.filter((column) => !relationSet.has(column.name) && !column.isPrimaryKey),
      ];
      const displayColumns = orderedColumns.slice(0, maxVisibleColumns);
      return {
        ...table,
        relationshipColumns: relationSet,
        fkColumns: fkColumns.get(table.key) ?? new Set<string>(),
        referencedColumns: referencedColumns.get(table.key) ?? new Set<string>(),
        displayColumns,
        hiddenColumns: Math.max(0, table.table.columns.length - displayColumns.length),
        height: 74 + displayColumns.length * 28 + (table.table.columns.length > displayColumns.length ? 28 : 0),
      };
    });

  return {
    tables,
    tablesByKey: new Map(tables.map((table) => [table.key, table])),
    edges: visibleEdges,
  };
}

function buildElkGraph(tables: TableMetric[], edges: DiagramEdge[]): ElkNode | null {
  if (tables.length === 0) return null;
  const schemaGroups = new Map<string, TableMetric[]>();
  tables.forEach((table) => {
    schemaGroups.set(table.schema, [...(schemaGroups.get(table.schema) ?? []), table]);
  });

  return {
    id: "schema-diagram",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "80",
      "elk.spacing.edgeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "110",
      "elk.layered.spacing.edgeNodeBetweenLayers": "36",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: Array.from(schemaGroups.entries()).map(([schema, schemaTables]) => ({
      id: schemaNodeId(schema),
      layoutOptions: {
        "elk.padding": "[top=66,left=18,bottom=18,right=18]",
        "elk.spacing.nodeNode": "24",
        "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      },
      children: schemaTables.map((table) => ({
        id: table.key,
        width: tableWidth,
        height: table.height,
      })),
    })),
    edges: edges.map((edge) => ({
      id: edge.key,
      sources: [edge.toKey],
      targets: [edge.fromKey],
    })),
  };
}

function readElkLayout(layoutedGraph: ElkNode, tableByKey: Map<string, TableMetric>, edges: DiagramEdge[]): DiagramLayout {
  const schemas: LayoutSchema[] = [];
  const tables: LayoutTable[] = [];
  const edgeByKey = new Map(edges.map((edge) => [edge.key, edge]));
  const schemaOffsetByTableKey = new Map<string, TableSchemaOffset>();

  for (const schemaNode of layoutedGraph.children ?? []) {
    const schemaX = schemaNode.x ?? 0;
    const schemaY = schemaNode.y ?? 0;
    schemas.push({
      key: schemaNode.id,
      name: schemaNode.id.replace(/^schema:/, ""),
      x: schemaX,
      y: schemaY,
      width: schemaNode.width ?? 0,
      height: schemaNode.height ?? 0,
    });

    for (const tableNode of schemaNode.children ?? []) {
      const metric = tableByKey.get(tableNode.id);
      if (!metric) continue;
      schemaOffsetByTableKey.set(tableNode.id, {
        schema: metric.schema,
        x: schemaX,
        y: schemaY,
      });
      tables.push({
        key: tableNode.id,
        x: schemaX + (tableNode.x ?? 0),
        y: schemaY + (tableNode.y ?? 0),
        width: tableNode.width ?? tableWidth,
        height: tableNode.height ?? metric.height,
        metric,
      });
    }
  }

  const tableLayoutByKey = new Map(tables.map((table) => [table.key, table]));
  const layoutEdges = collectElkEdges(layoutedGraph)
    .map((elkEdge) => {
      const edge = elkEdge.id ? edgeByKey.get(elkEdge.id) : undefined;
      if (!edge) return undefined;
      const pathData = edgePaths(
        elkEdge,
        tableLayoutByKey.get(edge.toKey),
        tableLayoutByKey.get(edge.fromKey),
        edge.fromKey,
        schemaOffsetByTableKey,
      );
      return {
        ...edge,
        ...pathData,
      };
    })
    .filter((edge): edge is LayoutEdge => Boolean(edge));

  const width = Math.max(
    640,
    (layoutedGraph.width ?? 0) + canvasPadding * 2,
    ...schemas.map((schema) => schema.x + schema.width + canvasPadding * 2),
    ...tables.map((table) => table.x + table.width + canvasPadding * 2),
  );
  const height = Math.max(
    420,
    (layoutedGraph.height ?? 0) + canvasPadding * 2,
    ...schemas.map((schema) => schema.y + schema.height + canvasPadding * 2),
    ...tables.map((table) => table.y + table.height + canvasPadding * 2),
  );

  return { schemas, tables, edges: layoutEdges, width, height };
}

function collectElkEdges(node: ElkNode): ElkExtendedEdge[] {
  return [...(node.edges ?? []), ...(node.children ?? []).flatMap((child) => collectElkEdges(child))];
}

function edgePaths(
  edge: ElkExtendedEdge,
  source: LayoutTable | undefined,
  target: LayoutTable | undefined,
  targetKey: string,
  schemaOffsetByTableKey: Map<string, TableSchemaOffset>,
) {
  if (edge.sections?.length) {
    const paths = edge.sections.map((section) =>
      sectionPath(
        [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
        sectionOffset(section, source, target, schemaOffsetByTableKey),
      ),
    );
    const markerPathIndex = edge.sections.findIndex((section) => section.outgoingShape === targetKey);
    return {
      paths,
      markerPathIndex: markerPathIndex >= 0 ? markerPathIndex : paths.length - 1,
    };
  }

  if (!source || !target) return { paths: [], markerPathIndex: 0 };
  const start = { x: source.x + source.width + canvasPadding, y: source.y + source.height / 2 + canvasPadding };
  const end = { x: target.x + canvasPadding, y: target.y + target.height / 2 + canvasPadding };
  const middleX = start.x + Math.max(40, (end.x - start.x) / 2);
  return {
    paths: [`M ${start.x} ${start.y} L ${middleX} ${start.y} L ${middleX} ${end.y} L ${end.x} ${end.y}`],
    markerPathIndex: 0,
  };
}

function sectionOffset(
  section: ElkSection,
  source: LayoutTable | undefined,
  target: LayoutTable | undefined,
  schemaOffsetByTableKey: Map<string, TableSchemaOffset>,
): DiagramPoint {
  const incomingOffset = section.incomingShape ? schemaOffsetByTableKey.get(section.incomingShape) : undefined;
  const outgoingOffset = section.outgoingShape ? schemaOffsetByTableKey.get(section.outgoingShape) : undefined;

  if (incomingOffset && outgoingOffset && incomingOffset.schema === outgoingOffset.schema) {
    return { x: incomingOffset.x, y: incomingOffset.y };
  }

  if (source && target && source.metric.schema === target.metric.schema) {
    const sourceOffset = schemaOffsetByTableKey.get(source.key);
    if (sourceOffset) return { x: sourceOffset.x, y: sourceOffset.y };
  }

  return { x: 0, y: 0 };
}

function sectionPath(points: DiagramPoint[], offset: DiagramPoint = { x: 0, y: 0 }) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x + offset.x + canvasPadding} ${point.y + offset.y + canvasPadding}`)
    .join(" ");
}

function DiagramTableCard({
  table,
  selected,
  related,
  onSelect,
  onHover,
}: {
  table: LayoutTable;
  selected: boolean;
  related: boolean;
  onSelect: () => void;
  onHover: (table: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn("diagram-table-card", selected && "selected", related && !selected && "related")}
      style={{
        left: table.x + canvasPadding,
        top: table.y + canvasPadding,
        width: table.width,
        minHeight: table.height,
      }}
      onClick={onSelect}
      onMouseEnter={() => onHover(table.key)}
      onMouseLeave={() => onHover("")}
    >
      <span className="diagram-table-schema">{table.metric.schema}</span>
      <span className="diagram-table-name">{formatTableLabel(table.metric.table.name)}</span>
      <span className="diagram-table-columns">
        {table.metric.displayColumns.map((column) => (
          <span key={column.name} className="diagram-table-column">
            <span className="truncate">{column.name}</span>
            <span className="diagram-column-badges">
              {column.isPrimaryKey ? <span>PK</span> : null}
              {table.metric.fkColumns.has(column.name) ? <span>FK</span> : null}
              {!table.metric.fkColumns.has(column.name) && table.metric.referencedColumns.has(column.name) ? <span>REF</span> : null}
            </span>
          </span>
        ))}
        {table.metric.hiddenColumns > 0 ? <span className="diagram-hidden-columns">+{table.metric.hiddenColumns} columns</span> : null}
      </span>
    </button>
  );
}

function DiagramMessage({ title, text, tone, compact }: { title: string; text: string; tone?: "danger"; compact?: boolean }) {
  return (
    <div className={cn("data-panel", compact ? "m-3 p-3" : "p-4", tone === "danger" && "border-[var(--red)]")}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">{title}</p>
      <p className={cn("mt-1 text-sm", tone === "danger" ? "text-[var(--red-light)]" : "text-muted")}>{text}</p>
    </div>
  );
}

function addColumns(target: Set<string> | undefined, columns: string[]) {
  if (!target) return;
  columns.forEach((column) => target.add(column));
}

function clampZoom(value: number) {
  return Math.min(maxZoom, Math.max(minZoom, Number(value.toFixed(2))));
}

function centerSelectedTable(viewport: HTMLDivElement | null, layout: DiagramLayout | undefined, selectedTable: string, zoom: number) {
  if (!viewport || !layout || !selectedTable) return;
  const table = layout.tables.find((item) => item.key === selectedTable);
  if (!table) return;
  viewport.scrollLeft = Math.max(0, (table.x + canvasPadding + table.width / 2) * zoom - viewport.clientWidth / 2);
  viewport.scrollTop = Math.max(0, (table.y + canvasPadding + table.height / 2) * zoom - viewport.clientHeight / 2);
}

function isInteractiveDiagramTarget(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("button,input,select,textarea,.diagram-edge"));
}

function isRelationshipActive(edge: DiagramEdge, selectedTable: string, hoveredTable: string, hoveredEdge: string) {
  if (edge.key === hoveredEdge) return true;
  if (hoveredTable) return edge.fromKey === hoveredTable || edge.toKey === hoveredTable;
  return edge.fromKey === selectedTable || edge.toKey === selectedTable;
}

function isTableRelated(table: string, selectedTable: string, edges: DiagramEdge[]) {
  if (!selectedTable) return false;
  return edges.some((edge) => (edge.fromKey === selectedTable && edge.toKey === table) || (edge.toKey === selectedTable && edge.fromKey === table));
}

function relationshipTitle(relationship: SQLCatalogRelationship) {
  return `${endpointKey(relationship.from)}(${relationship.from.columns.join(", ")}) references ${endpointKey(relationship.to)}(${relationship.to.columns.join(", ")})`;
}

function tableKey(schema: string, table: string) {
  return `${schema}.${table}`;
}

function endpointKey(endpoint: { schema: string; table: string }) {
  return tableKey(endpoint.schema, endpoint.table);
}

function schemaNodeId(schema: string) {
  return `schema:${schema}`;
}
