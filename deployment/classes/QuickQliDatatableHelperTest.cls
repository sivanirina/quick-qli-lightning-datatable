@isTest
public class QuickQliDatatableHelperTest {

    /**
     * Sets up test data: Standard Pricebook, Product, PricebookEntry, Account, Opportunity, and Quote.
     * Uses Test.getStandardPricebookId() for reliable pricebook reference in test context.
     */
    @testSetup
    static void setupTestData() {
        Id standardPbId = Test.getStandardPricebookId();

        Product2 prod = new Product2(Name = 'Test Product', IsActive = true, Family = 'Hardware', ProductCode = 'TP-001');
        insert prod;

        PricebookEntry pbe = new PricebookEntry(
            Pricebook2Id = standardPbId,
            Product2Id = prod.Id,
            UnitPrice = 100,
            IsActive = true,
            UseStandardPrice = false
        );
        insert pbe;

        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Opportunity opp = new Opportunity(
            Name = 'Test Opportunity',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            AccountId = acc.Id
        );
        insert opp;

        Quote q = new Quote(
            Name = 'Test Quote',
            Pricebook2Id = standardPbId,
            OpportunityId = opp.Id,
            Status = 'Draft'
        );
        insert q;
    }

    /**
     * Verifies getQuoteLineItems returns expected keys and at least one item.
     */
    @isTest
    static void testGetQuoteLineItems() {
        Quote q = [SELECT Id, Pricebook2Id FROM Quote LIMIT 1];
        Test.startTest();
        Map<String, Object> result = QuickQliDatatableHelper.getQuoteLineItems(q.Id, 0, 50);
        Test.stopTest();

        System.assert(result.containsKey('assignedPricebookId'), 'Should return assignedPricebookId');
        System.assert(result.containsKey('items'), 'Should return items');
        System.assert(result.containsKey('pricebookOptions'), 'Should return pricebookOptions');
        List<Object> items = (List<Object>)result.get('items');
        System.assert(items.size() > 0, 'Should return at least one item');
    }

    /**
     * Verifies createQuoteLineItems inserts a QuoteLineItem with correct values.
     */
    @isTest
    static void testCreateQuoteLineItems() {
        Quote q = [SELECT Id, Pricebook2Id FROM Quote LIMIT 1];
        PricebookEntry pbe = [SELECT Id, Product2Id, UnitPrice FROM PricebookEntry WHERE Pricebook2Id = :q.Pricebook2Id LIMIT 1];

        Map<String, Object> item = new Map<String, Object>{
            'pricebookEntryId' => pbe.Id,
            'product2Id' => pbe.Product2Id,
            'quantity' => 2,
            'unitPrice' => 150,
            'discount' => 10
        };
        List<Map<String, Object>> items = new List<Map<String, Object>>{ item };

        Test.startTest();
        QuickQliDatatableHelper.createQuoteLineItems(q.Id, items);
        Test.stopTest();

        List<QuoteLineItem> qlis = [SELECT Id, Quantity, UnitPrice, Discount FROM QuoteLineItem WHERE QuoteId = :q.Id];
        System.assertEquals(1, qlis.size(), 'Should have created one QuoteLineItem');
        System.assertEquals(2, qlis[0].Quantity, 'Quantity should match');
        System.assertEquals(150, qlis[0].UnitPrice, 'UnitPrice should match');
        System.assertEquals(10, qlis[0].Discount, 'Discount should match');
    }

    /**
     * Verifies assignPricebookToQuote updates the Quote with a new active pricebook.
     */
    @isTest
    static void testAssignPricebookToQuote() {
        Pricebook2 pb = new Pricebook2(Name = 'Custom PB', IsActive = true);
        insert pb;

        Quote q = [SELECT Id, Pricebook2Id FROM Quote LIMIT 1];

        Test.startTest();
        QuickQliDatatableHelper.assignPricebookToQuote(q.Id, pb.Id);
        Test.stopTest();

        Quote updatedQ = [SELECT Id, Pricebook2Id FROM Quote WHERE Id = :q.Id];
        System.assertEquals(pb.Id, updatedQ.Pricebook2Id, 'Quote should have new pricebook assigned');
    }

    /**
     * Verifies assignPricebookToQuote does not change the pricebook if already assigned.
     */
    @isTest
    static void testAssignPricebookToQuote_AlreadyAssigned() {
        Quote q = [SELECT Id, Pricebook2Id FROM Quote WHERE Pricebook2Id != NULL LIMIT 1];

        Test.startTest();
        QuickQliDatatableHelper.assignPricebookToQuote(q.Id, q.Pricebook2Id);
        Test.stopTest();

        Quote updatedQ = [SELECT Id, Pricebook2Id FROM Quote WHERE Id = :q.Id];
        System.assertEquals(q.Pricebook2Id, updatedQ.Pricebook2Id, 'Quote pricebook should remain the same');
    }
}