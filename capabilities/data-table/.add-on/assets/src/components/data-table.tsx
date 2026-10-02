import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type OnChangeFn,
	type PaginationState,
	type RowSelectionState,
	type SortingState,
	type Table,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

export interface DataTableProps<TData extends object> {
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	getRowId: (row: TData, index: number, parent?: unknown) => string;
	sorting?: SortingState;
	onSortingChange?: OnChangeFn<SortingState>;
	globalFilter?: string;
	onGlobalFilterChange?: OnChangeFn<string>;
	pagination?: PaginationState;
	onPaginationChange?: OnChangeFn<PaginationState>;
	columnVisibility?: VisibilityState;
	onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
	rowSelection?: RowSelectionState;
	onRowSelectionChange?: OnChangeFn<RowSelectionState>;
	manualSorting?: boolean;
	manualFiltering?: boolean;
	manualPagination?: boolean;
	pageCount?: number;
	ariaLabel: string;
	caption?: ReactNode;
	emptyMessage?: ReactNode;
}

export function DataTable<TData extends object>({
	data,
	columns,
	getRowId,
	ariaLabel,
	caption,
	emptyMessage = "No results.",
	...controlled
}: DataTableProps<TData>) {
	const table = useReactTable({
		data,
		columns,
		getRowId,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: controlled.manualSorting
			? undefined
			: getSortedRowModel(),
		getFilteredRowModel: controlled.manualFiltering
			? undefined
			: getFilteredRowModel(),
		getPaginationRowModel: controlled.manualPagination
			? undefined
			: getPaginationRowModel(),
		state: {
			sorting: controlled.sorting ?? [],
			globalFilter: controlled.globalFilter ?? "",
			pagination: controlled.pagination ?? { pageIndex: 0, pageSize: 20 },
			columnVisibility: controlled.columnVisibility ?? {},
			rowSelection: controlled.rowSelection ?? {},
		},
		onSortingChange: controlled.onSortingChange,
		onGlobalFilterChange: controlled.onGlobalFilterChange,
		onPaginationChange: controlled.onPaginationChange,
		onColumnVisibilityChange: controlled.onColumnVisibilityChange,
		onRowSelectionChange: controlled.onRowSelectionChange,
		manualSorting: controlled.manualSorting,
		manualFiltering: controlled.manualFiltering,
		manualPagination: controlled.manualPagination,
		pageCount: controlled.pageCount,
		enableRowSelection: true,
	});

	return (
		<AccessibleTable
			table={table}
			ariaLabel={ariaLabel}
			caption={caption}
			emptyMessage={emptyMessage}
		/>
	);
}

function AccessibleTable<TData extends object>({
	table,
	ariaLabel,
	caption,
	emptyMessage,
}: {
	table: Table<TData>;
	ariaLabel: string;
	caption?: ReactNode;
	emptyMessage: ReactNode;
}) {
	const rows = table.getRowModel().rows;
	return (
		<table aria-label={ariaLabel}>
			{caption ? <caption>{caption}</caption> : null}
			<thead>
				<tr>
					{table.getHeaderGroups()[0]?.headers.map((header) => (
						<th key={header.id} scope="col">
							{header.isPlaceholder ? null : (
								<button
									type="button"
									aria-label={`Sort by ${String(header.column.columnDef.header ?? header.id)}`}
									onClick={header.column.getToggleSortingHandler()}
								>
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
								</button>
							)}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.length === 0 ? (
					<tr>
						<td colSpan={Math.max(table.getVisibleLeafColumns().length, 1)}>
							{emptyMessage}
						</td>
					</tr>
				) : (
					rows.map((row) => (
						<tr key={row.id} data-selected={row.getIsSelected() || undefined}>
							{row.getVisibleCells().map((cell) => (
								<td key={cell.id}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</td>
							))}
						</tr>
					))
				)}
			</tbody>
		</table>
	);
}
