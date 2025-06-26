import { LightningElement, api, track } from 'lwc';
import getQuoteLineItems from '@salesforce/apex/QuickQliDatatableHelper.getQuoteLineItems';
import createQuoteLineItems from '@salesforce/apex/QuickQliDatatableHelper.createQuoteLineItems';
import assignPricebookToQuote from '@salesforce/apex/QuickQliDatatableHelper.assignPricebookToQuote';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Column definitions for lightning-datatable
// Read-only version for Available Products table (no editing)
const READ_ONLY_COLUMNS = [
    { label: 'Product Name', fieldName: 'productName', sortable: true },
    { label: 'Product Code', fieldName: 'productCode', sortable: true },
    { label: 'Family', fieldName: 'family', sortable: true },
    { label: 'List Price', fieldName: 'listPrice', type: 'currency', sortable: true, typeAttributes: { currencyCode: 'USD' } },
    // Spacer column to prevent last column from being hidden by scrollbar
    { label: '', fieldName: 'spacer', type: 'text', sortable: false, fixedWidth: 40 }
];
// Editable version for Selected Products table (allows editing)
const EDITABLE_COLUMNS = [
    { label: 'Product Name', fieldName: 'productName', sortable: true },
    { label: 'Product Code', fieldName: 'productCode', sortable: true },
    { label: 'Family', fieldName: 'family', sortable: true },
    { label: 'List Price', fieldName: 'listPrice', type: 'currency', sortable: true, typeAttributes: { currencyCode: 'USD' } },
    { label: 'Unit Price', fieldName: 'unitPrice', type: 'currency', editable: true, sortable: true, typeAttributes: { currencyCode: 'USD' } },
    { label: 'Quantity', fieldName: 'quantity', type: 'number', editable: true, sortable: true },
    { label: 'Discount (%)', fieldName: 'discount', type: 'number', editable: true, sortable: true },
    { label: 'Total Price', fieldName: 'totalPrice', type: 'currency', sortable: false, typeAttributes: { currencyCode: 'USD' } },
    { label: '', fieldName: 'spacer', type: 'text', sortable: false, cellAttributes: { class: 'spacer-cell' }, fixedWidth: 40 }
];

export default class QuickQliDatatable extends LightningElement {
    // The current Quote record Id (provided by the platform)
    @api recordId;

    // Data for the datatable (all items from Apex)
    @track items = [];
    @track totalCount = 0;
    @track pageSize = 50; // or whatever chunk size you want
    @track offsetSize = 0;
    @track isLoadingMore = false;
    // Column definitions for the datatable
    @track readOnlyColumns = READ_ONLY_COLUMNS;
    @track editableColumns = EDITABLE_COLUMNS;
    // Loading spinner state
    @track isLoading = false;
    @track isTableLoading = false; // Track loading state for the table
    // Error message to display
    @track error = '';
    // Success message state
    @track showSuccess = false;
    // Array of selected row keys (pricebookEntryId)
    @track selectedRows = [];
    // Array of selected item objects (for editing in Selected Products table)
    @track selectedItems = [];
    // Modal state for pricebook selection
    @track showPricebookModal = false;
    // Dropdown options for pricebooks
    @track pricebookOptions = [];
    // Currently selected pricebook Id
    @track selectedPricebook = '';
    // Holds unsaved edits in the datatable
    @track draftValues = [];
    // Current sorted column and direction
    @track sortBy;
    @track sortDirection;
    // Search/filter state for product name
    @track searchTerm = '';
    // Selected product family for filtering
    @track selectedFamily = '';
    // Options for product family filter dropdown
    @track familyOptions = [];

    debounceTimer; // Add this line at the top of your class


    // Called when the component is inserted into the DOM
    connectedCallback() {
        this.load();
    }

    /**
     * Loads quote line items and pricebook options from Apex.
     * Sets up initial state, builds family filter options, and handles loading/errors.
     */
    load(offset = 0, append = false) {
        console.log('Loading data: offset', offset, 'append', append);
        this.isLoading = !append;
        this.isLoadingMore = append;
        getQuoteLineItems({
            quoteId: this.recordId,
            offsetSize: offset,
            pageSize: this.pageSize,
            searchTerm: this.searchTerm,
            selectedFamily: this.selectedFamily
        })
            .then(data => {
                console.log('Loaded items:', data.items.length, 'Total count:', data.totalCount);
                const newItems = (data.items || []).map(item => ({
                    ...item,
                    quantity: Number(item.quantity) || 1,
                    unitPrice: Number(item.unitPrice) || 0,
                    discount: Number(item.discount) || 0,
                    spacer: '' // Add this line
                }));
                this.totalCount = data.totalCount || 0;
                if (append) {
                    this.items = [...this.items, ...newItems];
                } else {
                    this.items = newItems;
                }
                this.pricebookOptions = data.pricebookOptions || [];
                this.selectedPricebook = data.assignedPricebookId || '';
                // Show pricebook modal if no pricebook is assigned
                this.showPricebookModal = !this.selectedPricebook;
                this.error = '';

                // Build product family filter options from loaded items
                this.familyOptions = [
                    { label: 'All', value: '' },
                    ...Array.from(new Set(this.items.map(i => i.family).filter(f => f)))
                        .map(f => ({ label: f, value: f }))
                ];
            })
            .catch(e => {
                this.error = e?.body?.message || 'An error occurred while loading data.';
            })
            .finally(() => {
                this.isLoading = false;
                this.isLoadingMore = false;
            });
    }

    fetchFilteredItems() {
    this.isTableLoading = true;
    getQuoteLineItems({
        quoteId: this.recordId,
        offsetSize: 0,
        pageSize: this.pageSize,
        searchTerm: this.searchTerm,
        selectedFamily: this.selectedFamily
    })
        .then(data => {
            const newItems = (data.items || []).map(item => ({
                ...item,
                quantity: Number(item.quantity) || 1,
                unitPrice: Number(item.unitPrice) || 0,
                discount: Number(item.discount) || 0,
                spacer: ''
            }));
            this.items = newItems;
            this.totalCount = data.totalCount || 0;
            this.error = '';
        })
        .catch(e => {
            this.error = e?.body?.message || 'Error while searching/filtering.';
        })
        .finally(() => {
            this.isTableLoading = false;
        });
    }


    /**
     * Handles row selection in the Available Products datatable.
     * Updates the selectedRows array with pricebookEntryIds.
     * Also updates selectedItems array for the Selected Products table.
     * @param {Event} event - The row selection event from lightning-datatable
     */
    handleRowSelection(event) {
        // event.detail.selectedRows is an array of row objects
        const selectedRowData = event.detail.selectedRows;
        this.selectedRows = selectedRowData.map(row => row.pricebookEntryId);
        // Store full item objects for editing in the Selected Products table
        this.selectedItems = selectedRowData.map(row => {
            const full = this.items.find(i => i.pricebookEntryId === row.pricebookEntryId);
            // Calculate total price
            const unitPrice = Number(full.unitPrice) || 0;
            const quantity = Number(full.quantity) || 1;
            const discount = Number(full.discount) || 0;
            const totalPrice = unitPrice * quantity * (1 - discount / 100);
            return { ...full, totalPrice };
        });
    }

    /**
     * Handles cell edits in the Selected Products datatable.
     * Updates the selectedItems array with the edited values and clears draft values.
     * @param {Event} event - The save event from lightning-datatable
     */
    handleSave(event) {
        const draftValues = event.detail.draftValues;
        // Merge draft values into selectedItems
        this.selectedItems = this.selectedItems.map(item => {
            const draft = draftValues.find(d => d.pricebookEntryId === item.pricebookEntryId);
            const merged = draft ? { ...item, ...draft } : item;
            const unitPrice = Number(merged.unitPrice) || 0;
            const quantity = Number(merged.quantity) || 1;
            const discount = Number(merged.discount) || 0;
            const totalPrice = unitPrice * quantity * (1 - discount / 100);
            return { ...merged, totalPrice };
        });
        this.draftValues = []; // Clear after save
    }

    /**
     * Handles the Create Items button click.
     * Filters selected items, validates them, and calls Apex to create QLIs.
     */
    handleCreate() {
        // Prepare selected items for creation
        const selectedItems = this.selectedItems
            .filter(item => this.selectedRows.includes(item.pricebookEntryId))
            .map(item => ({
                pricebookEntryId: item.pricebookEntryId,
                product2Id: item.product2Id,
                quantity: Number(item.quantity) || 1,
                unitPrice: Number(item.unitPrice) || 0,
                discount: Number(item.discount) || 0
            }))
            .filter(item =>
                item.pricebookEntryId &&
                item.product2Id &&
                item.unitPrice !== undefined &&
                item.quantity > 0
            );

        if (selectedItems.length === 0) {
            this.error = 'Please select at least one valid product with quantity > 0.';
            return;
        }

        this.isLoading = true;
        createQuoteLineItems({
            quoteId: this.recordId,
            items: selectedItems
        })
            .then(() => {
                this.error = '';
                this.showSuccess = true;
                this.selectedRows = [];
                this.selectedItems = [];
                this.load(); // Reload data after creation

                // Show Salesforce-style toast
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Quote Line Items created!',
                        variant: 'success'
                    })
                );
            })
            .catch(e => {
                this.error = e?.body?.message || 'Failed to create quote line items.';
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    /**
     * Handles changes in the pricebook dropdown in the modal.
     * @param {Event} event - The combobox change event
     */
    handlePricebookChange(event) {
        this.selectedPricebook = event.detail.value;
    }

    /**
     * Handles the Cancel button in the pricebook modal.
     * Closes the modal without making changes.
     */
    handleCancelPricebookModal() {
        this.showPricebookModal = false;
    }

    /**
     * Handles the Save button in the pricebook modal.
     * Assigns the selected pricebook to the quote, closes the modal,
     * shows a success message, and refreshes the page after a short delay.
     */
    handleSavePricebookModal() {
        this.isLoading = true;
        assignPricebookToQuote({ quoteId: this.recordId, pricebookId: this.selectedPricebook })
            .then(() => {
                this.showPricebookModal = false;
                this.showSuccess = true;
                // Optionally show a toast notification
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Success',
                    message: 'Quote updated with selected Price Book.',
                    variant: 'success'
                }));
                // Delay, then refresh the page to show updated data
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            })
            .catch(e => {
                this.error = e?.body?.message || 'Failed to assign Price Book.';
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    /**
     * Handles column sorting in the datatable.
     * Updates sortBy and sortDirection, then sorts the items array.
     * @param {Event} event - The sort event from lightning-datatable
     */
    handleSort(event) {
        this.sortBy = event.detail.fieldName;
        this.sortDirection = event.detail.sortDirection;
        this.sortData(this.sortBy, this.sortDirection);
    }

    /**
     * Utility function to sort the items array by a given field and direction.
     * @param {String} fieldname - The field to sort by
     * @param {String} direction - 'asc' or 'desc'
     */
    sortData(fieldname, direction) {
        let parseData = JSON.parse(JSON.stringify(this.items));
        let keyValue = (a) => a[fieldname] ? a[fieldname].toString().toLowerCase() : '';

        parseData.sort((x, y) => {
            let xValue = keyValue(x);
            let yValue = keyValue(y);
            if (xValue > yValue) {
                return direction === 'asc' ? 1 : -1;
            }
            if (xValue < yValue) {
                return direction === 'asc' ? -1 : 1;
            }
            return 0;
        });

        this.items = parseData;
    }

    /**
     * Handles changes in the search input for product name.
     * Updates the searchTerm property.
     * @param {Event} event - The input event from lightning-input
     */
    handleSearchChange(event) {
        const value = event.target.value;
        this.searchTerm = value;
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.offsetSize = 0;
            this.fetchFilteredItems(); // Only reload table content
        }, 500);
    }

    /**
     * Getter that returns the filtered list of items based on search and family filter.
     * Used as the data source for the Available Products datatable.
     */
    get filteredItems() {
        return this.items;
    }

    /**
     * Handles changes in the product family filter dropdown.
     * Updates the selectedFamily property.
     * @param {Event} event - The combobox change event
     */
    handleFamilyChange(event) {
        this.selectedFamily = event.detail.value;
        this.offsetSize = 0;
        this.fetchFilteredItems(); // Only reload table content
    }

    /**
     * Handles the Load More button click in the datatable.
     * Loads the next page of data if available.
     * @param {Event} event - The load more event from lightning-datatable
     */
    handleLoadMore(event) {
        if (this.items.length >= this.totalCount) return; // No more data
        this.offsetSize = this.items.length;
        this.load(this.offsetSize, true);
    }

}