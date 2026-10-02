import { useState } from "react";
import { createColumnHelper, type SortingState, type PaginationState, type ColumnVisibilityState, type RowSelectionState } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "../src/components/data-table";
const data = [ { id: "ada", name: "Ada", score: 30 }, { id: "bea", name: "Bea", score: 10 }, { id: "cy", name: "Cy", score: 20 } ];
const helper = createColumnHelper<typeof dataTableFeatures, typeof data[number]>();
const columns = helper.columns([
 helper.display({ id: "select", header: "Select", cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.name}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> }),
 helper.group({ id: "person", header: "Person", columns: helper.columns([helper.accessor("name", { header: "Name" }), helper.accessor("score", { header: "Score" })]) }),
]);
export function Example() {
 const [sorting, onSortingChange] = useState<SortingState>([]);
 const [globalFilter, onGlobalFilterChange] = useState("");
 const [pagination, onPaginationChange] = useState<PaginationState>({pageIndex:0,pageSize:2});
 const [columnVisibility, onColumnVisibilityChange] = useState<ColumnVisibilityState>({});
 const [rowSelection, onRowSelectionChange] = useState<RowSelectionState>({});
 const [manual, setManual] = useState(false);
 const [mounted, setMounted] = useState(true);
 return <>
  <button type="button" onClick={() => setMounted(value => !value)}>Toggle table</button>
  <button type="button" onClick={() => {setManual(value => !value);onPaginationChange({pageIndex:0,pageSize:2});}}>Toggle manual</button>
  <output aria-label="Mode">{manual ? "manual" : "client"}</output>
  {mounted && <DataTable data={data} columns={columns} getRowId={row => row.id} ariaLabel="People" caption="People fixture"
   sorting={sorting} onSortingChange={onSortingChange} globalFilter={globalFilter} onGlobalFilterChange={onGlobalFilterChange}
   pagination={pagination} onPaginationChange={onPaginationChange} columnVisibility={columnVisibility} onColumnVisibilityChange={onColumnVisibilityChange}
   rowSelection={rowSelection} onRowSelectionChange={onRowSelectionChange}
   manualSorting={manual} manualFiltering={manual} manualPagination={manual} pageCount={manual ? 4 : undefined}>
   {table => <>
    <label>Filter<input value={globalFilter} onChange={event => {table.setGlobalFilter(event.target.value);table.setPageIndex(0);}} /></label>
    <button type="button" onClick={() => table.getColumn("score")?.toggleVisibility()}>Toggle score</button>
    <button type="button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button>
    <button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
    <output aria-label="Page">{pagination.pageIndex + 1}</output>
    <output aria-label="Selection">{Object.keys(rowSelection).filter(id => rowSelection[id]).join(",")}</output>
   </>}
  </DataTable>}
  <DataTable data={data} columns={columns} getRowId={row => row.id} ariaLabel="Uncontrolled" />
 </>;
}
