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

## **4. Set up FastAPI backend**

### **Navigate to the `backend` Directory**

```bash
cd ../backend
```

### **Environment Variables**

Create a `.env` file in the `backend` directory with the following variables:

```env
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=
GOOGLE_API_KEY=
UNSTRUCTURED_API_KEY=
UNSTRUCTURED_API_URL=
```

### **Run and Deploy Backend**
Run the FastAPI Backend
```bash
uvicorn main:app --reload
```

Expose port 8000 to edge functions
```bash
ngrok http 8000
```

## **5. Running the Full Application**

1. Ensure both the React frontend and Supabase edge functions and backend are running.
2. Use ngrok to expose backend and set the URL as BACKEND_URL in supabase secrets
3. Test the application by navigating to [http://localhost:3000](http://localhost:3000).

---

## **6. Folder Structure**

- `frontend`: Contains the React application.
- `supabase_edge_functions`: Contains the Supabase edge functions and configuration.
- `backend` : Contains the document processing and query services

---
