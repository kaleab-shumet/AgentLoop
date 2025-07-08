export const realWorldOrder = {
  orderId: "ORD-2024-0001",
  customer: {
    id: "CUST-12345",
    name: {
      first: "Alice",
      last: "Smith"
    },
    contact: {
      email: "alice.smith@example.com",
      phone: "+1-555-1234"
    },
    addresses: [
      {
        type: "billing",
        address: {
          line1: "123 Main St",
          line2: "Apt 4B",
          city: "Metropolis",
          state: "NY",
          zip: "10001",
          country: "USA"
        }
      },
      {
        type: "shipping",
        address: {
          line1: "456 Elm St",
          line2: null,
          city: "Gotham",
          state: "NJ",
          zip: "07001",
          country: "USA"
        }
      }
    ]
  },
  items: [
    {
      sku: "SKU-001",
      name: "Wireless Mouse",
      quantity: 2,
      price: 25.99,
      options: {
        color: "black",
        warranty: "2 years"
      }
    },
    {
      sku: "SKU-002",
      name: "Mechanical Keyboard",
      quantity: 1,
      price: 89.5,
      options: {
        color: "white",
        layout: "US"
      }
    }
  ],
  shipping: {
    method: "Express",
    cost: 15.0,
    tracking: {
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      status: "In Transit",
      history: [
        { date: "2024-06-01T10:00:00Z", location: "Warehouse", event: "Shipped" },
        { date: "2024-06-02T08:30:00Z", location: "Distribution Center", event: "In Transit" },
        { date: "2024-06-03T14:45:00Z", location: "Gotham", event: "Out for Delivery" }
      ]
    }
  },
  payment: {
    method: "Credit Card",
    transactionId: "TXN-7890-XYZ",
    amount: 156.48,
    currency: "USD",
    status: "Paid"
  },
  orderDate: "2024-06-01T09:45:00Z",
  notes: null,
  metadata: {
    source: "web",
    campaign: "SUMMER24",
    gift: false
  }
}; 