import { useState } from "react";
import { createColumnHelper, type SortingState, type PaginationState, type ColumnVisibilityState, type RowSelectionState } from "@tanstack/react-table";
import { DataTable, dataTableFeatures, type DataTableProps } from "../src/components/data-table";
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
 const [controlled, setControlled] = useState(true);
 const [mounted, setMounted] = useState(true);
 const common = {data,columns,getRowId:(row:typeof data[number])=>row.id,ariaLabel:"People",caption:"People fixture",manualSorting:manual,manualFiltering:manual,manualPagination:manual,pageCount:manual ? 4 : undefined};
 const tableProps:DataTableProps<typeof data[number]> = controlled ? {...common,sorting,onSortingChange,globalFilter,onGlobalFilterChange,pagination,onPaginationChange,columnVisibility,onColumnVisibilityChange,rowSelection,onRowSelectionChange} : common;
 return <>
  <button type="button" onClick={() => setControlled(value => !value)}>Toggle ownership</button>
  <output aria-label="Parent filter">{globalFilter}</output>
  <button type="button" onClick={() => setMounted(value => !value)}>Toggle table</button>
  <button type="button" onClick={() => {setManual(value => !value);onPaginationChange({pageIndex:0,pageSize:2});}}>Toggle manual</button>
  <output aria-label="Mode">{manual ? "manual" : "client"}</output>
  {mounted && <DataTable {...tableProps}>
   {table => <>
    <label>Filter<input value={table.state.globalFilter} onChange={event => {table.setGlobalFilter(event.target.value);table.setPageIndex(0);}} /></label>
    <button type="button" onClick={() => table.getColumn("score")?.toggleVisibility()}>Toggle score</button>
    <button type="button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button>
    <button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
    <output aria-label="Page">{table.state.pagination.pageIndex + 1}</output>
    <output aria-label="Selection">{Object.keys(table.state.rowSelection).filter(id => table.state.rowSelection[id]).join(",")}</output>
   </>}
  </DataTable>}
  <DataTable data={data} columns={columns} getRowId={row => row.id} ariaLabel="Uncontrolled" />
 </>;
}
