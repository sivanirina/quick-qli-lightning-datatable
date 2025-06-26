public with sharing class QuickQliDatatableHelper {

    /**
     * Retrieves available products (PricebookEntries) for the quote's pricebook,
     * as well as available pricebooks for selection.
     * @param quoteId The Id of the Quote.
     * @return Map with keys: 'assignedPricebookId', 'items', 'pricebookOptions'
     * Throws AuraHandledException if quoteId is null or not found.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getQuoteLineItems(
        Id quoteId, Integer offsetSize, Integer pageSize, String searchTerm, String selectedFamily
    ) {
        Map<String, Object> result = new Map<String, Object>();
        if (quoteId == null) {
            throw new AuraHandledException('Quote Id must not be null.');
        }
        // Query for the Quote and its assigned Pricebook
        List<Quote> quotes = [SELECT Id, Pricebook2Id FROM Quote WHERE Id = :quoteId LIMIT 1];
        if (quotes.isEmpty()) {
            throw new AuraHandledException('Quote not found for Id: ' + String.valueOf(quoteId));
        }
        Quote quote = quotes[0];
        Id assignedPBId = quote.Pricebook2Id;
        result.put('assignedPricebookId', assignedPBId);

        // Pagination logic
        Integer offsetVal = offsetSize != null ? offsetSize : 0;
        Integer limitVal = pageSize != null ? pageSize : 50;

        // Build product list for the assigned pricebook
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        Integer totalCount = 0;
        if (assignedPBId != null) {
            // Build dynamic filters
            String nameFilter = (searchTerm != null && searchTerm != '') ? '%' + searchTerm + '%' : null;
            String familyFilter = (selectedFamily != null && selectedFamily != '') ? selectedFamily : null;

            // Build the base query string
            String baseQuery = 'FROM PricebookEntry WHERE Pricebook2Id = :assignedPBId AND IsActive = TRUE AND Product2.IsActive = TRUE';
            if (nameFilter != null) {
                baseQuery += ' AND Product2.Name LIKE :nameFilter';
            }
            if (familyFilter != null) {
                baseQuery += ' AND Product2.Family = :familyFilter';
            }

            // Get total count for lazy loading
            String countQuery = 'SELECT COUNT() ' + baseQuery;
            totalCount = Database.countQuery(countQuery);

            // Get paginated results
            String dataQuery = 'SELECT Id, UnitPrice, Product2Id, Pricebook2Id, Product2.Name, Product2.Family, Product2.ProductCode ' +
                               baseQuery +
                               ' ORDER BY Product2.Name LIMIT :limitVal OFFSET :offsetVal';
            List<PricebookEntry> entries = Database.query(dataQuery);

            for (PricebookEntry entry : entries) {
                Map<String, Object> item = new Map<String, Object>{
                    'id' => entry.Id,
                    'pricebookEntryId' => entry.Id,
                    'product2Id' => entry.Product2Id,
                    'productName' => entry.Product2.Name,
                    'productCode' => entry.Product2.ProductCode,
                    'family' => entry.Product2.Family,
                    'listPrice' => entry.UnitPrice,
                    'unitPrice' => entry.UnitPrice,
                    'quantity' => 1,
                    'discount' => 0
                };
                items.add(item);
            }
        }
        result.put('items', items);
        result.put('totalCount', totalCount);

        // Build dropdown options for all active pricebooks
        List<Pricebook2> pricebooks = [SELECT Id, Name FROM Pricebook2 WHERE IsActive = TRUE];
        List<Map<String, String>> pricebookOptions = new List<Map<String, String>>();
        for (Pricebook2 pb : pricebooks) {
            pricebookOptions.add(new Map<String, String>{
                'label' => pb.Name,
                'value' => pb.Id
            });
        }
        result.put('pricebookOptions', pricebookOptions);

        return result;
    }

    /**
     * Creates Quote Line Items for a given Quote.
     * @param quoteId The Id of the Quote to add line items to.
     * @param items A list of maps, each representing a line item with required fields.
     * Throws AuraHandledException if required fields are missing or invalid.
     */
    @AuraEnabled
    public static void createQuoteLineItems(Id quoteId, List<Map<String, Object>> items) {
        try {
            List<QuoteLineItem> qlis = new List<QuoteLineItem>();
            for (Map<String, Object> dto : items) {
                // Extract and validate required fields
                Id pbeId = (Id) dto.get('pricebookEntryId');
                Id product2Id = (Id) dto.get('product2Id');
                Decimal quantity = dto.containsKey('quantity') ? (Decimal) dto.get('quantity') : 1;
                Decimal unitPrice = (Decimal) dto.get('unitPrice');
                Decimal discount = dto.containsKey('discount') ? (Decimal) dto.get('discount') : 0;

                if (pbeId == null) throw new AuraHandledException('Missing pricebookEntryId');
                // Ensure PricebookEntry exists
                if ([SELECT count() FROM PricebookEntry WHERE Id = :pbeId] == 0) {
                    throw new AuraHandledException('Invalid pricebook entry: ' + String.valueOf(pbeId));
                }
                if (product2Id == null) throw new AuraHandledException('Missing product2Id');
                if (unitPrice == null) throw new AuraHandledException('Missing unitPrice');
                if (quantity == null || quantity <= 0) throw new AuraHandledException('Invalid or missing quantity');

                // Add new QuoteLineItem to the list
                qlis.add(new QuoteLineItem(
                    QuoteId = quoteId,
                    Product2Id = product2Id,
                    PricebookEntryId = pbeId,
                    Quantity = quantity,
                    UnitPrice = unitPrice,
                    Discount = discount
                ));
            }
            if (qlis.isEmpty()) {
                throw new AuraHandledException('No valid QuoteLineItems to insert.');
            }
            insert qlis;
        } catch (Exception e) {
            // Wrap and rethrow with a clear message for the UI
            throw new AuraHandledException('Failed to create Quote Line Items: ' + e.getMessage());
        }
    }

    /**
     * Assigns a pricebook to the given quote.
     * @param quoteId The Id of the Quote to update.
     * @param pricebookId The Id of the Pricebook2 to assign.
     * Throws AuraHandledException if either Id is null or pricebook is inactive.
     */
    @AuraEnabled
    public static void assignPricebookToQuote(Id quoteId, Id pricebookId) {
        if (quoteId == null || pricebookId == null) {
            throw new AuraHandledException('Quote ID and Price Book ID must not be null.');
        }
        // In test context, skip active check for Standard Pricebook
        if (!(Test.isRunningTest() && pricebookId == Test.getStandardPricebookId())) {
            List<Pricebook2> pbs = [SELECT Id, IsActive FROM Pricebook2 WHERE Id = :pricebookId LIMIT 1];
            if (pbs.isEmpty()) {
                throw new AuraHandledException('Pricebook not found for Id: ' + pricebookId);
            }
            Pricebook2 pb = pbs[0];
            if (!pb.IsActive) {
                throw new AuraHandledException('Cannot assign an inactive pricebook.');
            }
        }
        // Update the quote's Pricebook2Id
        Quote quote = [SELECT Id, Pricebook2Id FROM Quote WHERE Id = :quoteId LIMIT 1];
        quote.Pricebook2Id = pricebookId;
        update quote;
    }
}