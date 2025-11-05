# Financial Spreadsheet Application

A comprehensive financial modeling application built with React, Vite, and SpreadJS, featuring interconnected spreadsheets with dynamic cross-sheet formulas and real-time calculations.

## 🚀 Features

### **Core Functionality**
- **Multi-Sheet Financial Model**: 8 interconnected spreadsheets covering all aspects of financial planning
- **Dynamic Cross-Sheet References**: Formulas automatically update across sheets when data changes
- **JSON Template System**: Pre-configured templates for rapid financial model setup
- **Real-Time Calculations**: Live updates of financial metrics, variances, and KPIs

### **Financial Sheets Included**
- **Revenue Channel**: Sales breakdown by channel with automatic totals
- **HR**: Employee count and salary budget tracking
- **Expenses**: Operating, marketing, R&D, and admin expense management
- **Capex**: Capital expenditure tracking with depreciation calculations
- **Budget Plan**: Master budget with variance analysis against actuals
- **Profit Loss**: Quarterly and annual P&L with dynamic calculations
- **Financial Summary**: Key financial metrics and performance indicators
- **Assumptions**: External factors and market assumptions

### **Advanced Features**
- **Cross-Sheet Relationships**: Budget Plan pulls actuals from operational sheets
- **Dynamic Formulas**: Profit margins, ROI, cash flow calculations
- **Variance Analysis**: Automatic comparison of planned vs actual performance
- **Interactive Dashboard**: Real-time financial metrics and status indicators

## 🛠️ Technology Stack

- **Frontend**: React 18 with Vite
- **Spreadsheet Engine**: SpreadJS (GrapeCity)
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Language**: JavaScript (ES6+)

## 📊 Data Flow Architecture

```
Revenue Channel → Budget Plan (Revenue Actuals)
     ↓
HR → Budget Plan (HR Costs Actuals)
     ↓
Expenses → Profit Loss (Operating Expenses)
     ↓
Capex → Profit Loss (Depreciation) → Financial Summary (ROI)
     ↓
Budget Plan → Financial Summary (Variance Analysis)
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd poc-spreadjs-server-4/client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   ```
   http://localhost:10050
   ```

### Environment Variables

The application uses the following environment variables (configured in `.env`):

- `VITE_WEBSOCKET_URL` - WebSocket server URL for remote control (default: `ws://localhost:10052`)
- `VITE_NODE_ENV` - Environment mode (development/production)
- `VITE_API_BASE_URL` - REST API base URL for conversation management (default: `http://localhost:10051`)

Copy `.env.example` to `.env` and modify as needed.

### Build for Production

```bash
npm run build
```

## 📁 Project Structure

```
client/
├── public/
│   ├── libs/spreadjs/          # SpreadJS library files
│   └── templates/              # JSON spreadsheet templates
│       ├── sample-revenue-channel.json
│       ├── sample-hr.json
│       ├── sample-expenses.json
│       ├── sample-capex.json
│       ├── sample-budget-plan.json
│       ├── sample-profit-loss.json
│       ├── sample-financial-summary.json
│       └── sample-assumptions.json
├── src/
│   ├── components/
│   │   ├── SpreadSheetEditor.jsx
│   │   └── ui/
│   ├── hooks/
│   │   └── useSpreadSheet.js
│   ├── lib/
│   │   └── utils.js
│   └── pages/
│       └── SpreadSheetEditorPageJSONTemplateCreation.jsx
├── package.json
└── README.md
```

## 🔧 Key Components

### **useSpreadSheet Hook**
Centralized spreadsheet management with functions for:
- Sheet creation and manipulation
- JSON template loading
- Cross-sheet data synchronization

### **JSON Templates**
Pre-configured spreadsheet templates with:
- Pre-defined formulas and calculations
- Styling and formatting
- Cross-sheet reference relationships

### **Dynamic Calculations**
- **Revenue Growth**: `(Q4 - Q1) / Q1 * 100`
- **Profit Margin**: `Net Profit / Revenue * 100`
- **ROI**: `Net Profit / Capex * 100`
- **Cash Flow**: `Net Profit + Depreciation`
- **Variance Analysis**: `(Actual - Planned) / Planned * 100`

## 📈 Usage Examples

### **Adding New Revenue**
1. Update values in Revenue Channel sheet
2. Budget Plan automatically reflects new revenue actuals
3. Profit Loss recalculates revenue totals
4. Financial Summary updates growth metrics

### **Expense Management**
1. Modify expenses in operational sheets
2. Budget variances update automatically
3. Profit calculations adjust in real-time
4. Cash flow projections update accordingly

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test cross-sheet relationships
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Common Issues
- **JSON Template Errors**: Ensure all template files are valid JSON
- **Cross-Sheet References**: Verify sheet names match exactly in formulas
- **Build Errors**: Clear node_modules and reinstall dependencies

### Support
For issues related to SpreadJS functionality, refer to the [GrapeCity Documentation](https://www.grapecity.com/spreadjs).
