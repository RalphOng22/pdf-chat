# pdf-chat

---

# **React + Supabase Application**

This project is a full-stack application built with React for the frontend and Supabase as the backend. It includes edge functions in Supabase for additional functionality. Follow the steps below to set up and run the project locally.

---

## **Prerequisites**

Before starting, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (Recommended: v16 or above)
- [npm](https://www.npmjs.com/) (comes with Node.js) or [yarn](https://yarnpkg.com/)
- A [Supabase](https://supabase.com/) account

---

## **1. Clone the Repository**

```bash
git clone <repository-url>
cd <repository-name>
```

---

## **2. Set Up the Frontend**

### **Navigate to the `frontend` Directory**

```bash
cd frontend
```

### **Install Dependencies**

```bash
npm install
```

or

```bash
yarn install
```

### **Environment Variables**

Create a `.env` file in the `frontend` directory with the following variables:

```env
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_ANON_KEY=...
REACT_APP_UPLOAD_PDF_EDGE_FUNCTION_URL=...
REACT_APP_SUPABASE_SERVICE_KEY=...
GOOGLE_API_KEY=...
```

Replace `your_supabase_edge_function_url` with the URL of your Supabase edge function.

### **Run the Frontend**

```bash
npm start
```

or

```bash
yarn start
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## **3. Set Up Supabase Edge Functions**

### **Navigate to the `supabase_edge_functions` Directory**

```bash
cd ../supabase_edge_functions
```

### **Environment Variables**

Create a `.env` file in the `supabase_edge_functions` directory with the following variables:

```env
GOOGLE_API_KEY=...
```

### **Deploy Edge Functions**

To deploy the Supabase edge functions, follow these steps:

1. **Login to Supabase CLI** (if not already installed, download it [here](https://supabase.com/docs/guides/cli)):

   ```bash
   supabase login
   ```

2. **Link the Project**:

   ```bash
   supabase link --project-ref <project-ref-id>
   ```

   Replace `<project-ref-id>` with your Supabase project reference ID.

3. **Deploy Functions**:

   ```bash
   supabase functions deploy document-query
   supabase functions deploy chat-title-generator
   ```

   Ensure the functions are deployed and accessible from your Supabase dashboard.

---

## **4. Running the Full Application**

1. Ensure both the React frontend and Supabase edge functions are running.
2. Test the application by navigating to [http://localhost:3000](http://localhost:3000).

---

## **5. Folder Structure**

- `frontend`: Contains the React application.
- `supabase_edge_functions`: Contains the Supabase edge functions and configuration.

---

## **6. Troubleshooting**

### Common Issues:

- **Environment Variables Missing**: Ensure all `.env` files are created correctly with valid values.
- **Supabase Functions Not Working**: Verify the deployment in the Supabase dashboard.
- **React App Not Starting**: Ensure dependencies are installed using `npm install` or `yarn install`.

For further assistance, check the Supabase [documentation](https://supabase.com/docs) or React [documentation](https://reactjs.org/docs/getting-started.html).

---

Feel free to ask if you need further clarification or adjustments! 🚀