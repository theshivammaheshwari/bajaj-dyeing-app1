from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from bson import ObjectId
from datetime import datetime
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class DyeItem(BaseModel):
    dye_name: str
    quantity: float  # in grams

class Shade(BaseModel):
    id: Optional[str] = None
    shade_number: str
    original_weight: float  # in kg
    program_number: str  # P1, P2, or P3
    rc: str  # Reduction Clearing: Yes/No
    dyes: List[DyeItem]
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

class ShadeCreate(BaseModel):
    shade_number: str
    original_weight: float
    program_number: str
    rc: str
    dyes: List[DyeItem]

class ShadeUpdate(BaseModel):
    shade_number: Optional[str] = None
    original_weight: Optional[float] = None
    program_number: Optional[str] = None
    rc: Optional[str] = None
    dyes: Optional[List[DyeItem]] = None

class CalculateRequest(BaseModel):
    shade_id: str
    target_weight: float  # in kg

class ScaledDye(BaseModel):
    dye_name: str
    original_quantity: float
    per_kg: float
    scaled_quantity: float

class CalculateResponse(BaseModel):
    shade_number: str
    original_weight: float
    target_weight: float
    scaled_dyes: List[ScaledDye]

class AllMachinesCalculation(BaseModel):
    shade_number: str
    original_weight: float
    machines: dict  # {"6": [...], "10.5": [...], "12": [...], "24": [...]}
    
class CartDye(BaseModel):
    dye_name: str
    quantity: float

class CartItemModel(BaseModel):
    id: str
    shadeNumber: str
    programNumber: str
    weight: float
    rc: str
    machine: Optional[str] = None
    originalWeight: float
    twoP: Optional[str] = None
    threeP: Optional[str] = None
    dyes: List[CartDye]

class UserCart(BaseModel):
    user_id: str
    items: List[CartItemModel]
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class MachineTask(BaseModel):
    id: Optional[str] = None
    shade_id: str
    shade_number: str
    original_shade_number: Optional[str] = None
    updated_shade_number: Optional[str] = None
    is_modified: Optional[bool] = False
    carried_forward: Optional[bool] = False
    original_date: Optional[str] = None
    springs_2ply: int
    springs_3ply: int
    weight: float
    ply2_weight: Optional[float] = 0  # Weight in kg
    ply3_weight: Optional[float] = 0  # Weight in kg
    start_time: Optional[str] = None  # ISO format
    end_time: Optional[str] = None    # ISO format
    completed_at: Optional[str] = None # ISO format for 24h lock
    duration: Optional[str] = None    # e.g., "45 min" or "1h 20m"
    status: Optional[str] = "pending"  # pending/in-progress/completed/rejected
    type: Optional[str] = "manual"     # manual/automatic
    machine: Optional[str] = None      # M1-M11 if specifically routed
    assigned_to: Optional[str] = "user1"  # "user1" or "user2" (default to "user1")

class DailyTask(BaseModel):
    id: Optional[str] = None
    date: str  # YYYY-MM-DD format
    m1: Optional[List[MachineTask]] = []
    m2: Optional[List[MachineTask]] = []
    m3: Optional[List[MachineTask]] = []
    m4: Optional[List[MachineTask]] = []
    m5: Optional[List[MachineTask]] = []
    m6: Optional[List[MachineTask]] = []
    m7: Optional[List[MachineTask]] = []
    m8: Optional[List[MachineTask]] = []
    m9: Optional[List[MachineTask]] = []
    m10: Optional[List[MachineTask]] = []
    m11: Optional[List[MachineTask]] = []
    automatic_tasks: Optional[List[MachineTask]] = []
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

class DailyTaskCreate(BaseModel):
    date: str
    m1: Optional[List[MachineTask]] = []
    m2: Optional[List[MachineTask]] = []
    m3: Optional[List[MachineTask]] = []
    m4: Optional[List[MachineTask]] = []
    m5: Optional[List[MachineTask]] = []
    m6: Optional[List[MachineTask]] = []
    m7: Optional[List[MachineTask]] = []
    m8: Optional[List[MachineTask]] = []
    m9: Optional[List[MachineTask]] = []
    m10: Optional[List[MachineTask]] = []
    m11: Optional[List[MachineTask]] = []
    automatic_tasks: Optional[List[MachineTask]] = []


# Helper function to convert MongoDB ObjectId to string
def shade_helper(shade) -> dict:
    return {
        "id": str(shade["_id"]),
        "shade_number": shade["shade_number"],
        "original_weight": shade["original_weight"],
        "program_number": shade.get("program_number", "P1"),
        "rc": shade.get("rc", "No"),
        "dyes": shade["dyes"],
        "created_at": shade.get("created_at")
    }


# Routes
@api_router.get("/")
async def root():
    return {"message": "Dyeing Recipe Calculator API"}


@api_router.post("/shades", response_model=Shade)
async def create_shade(shade: ShadeCreate):
    """Create a new shade recipe"""
    # Check if shade number already exists to prevent duplicates
    existing_shade = await db.shades.find_one({"shade_number": shade.shade_number})
    if existing_shade:
        raise HTTPException(status_code=400, detail=f"Shade #{shade.shade_number} already exists")
    
    shade_dict = shade.dict()
    shade_dict["created_at"] = datetime.utcnow()
    
    result = await db.shades.insert_one(shade_dict)
    created_shade = await db.shades.find_one({"_id": result.inserted_id})
    
    return shade_helper(created_shade)


@api_router.get("/shades", response_model=List[Shade])
async def get_all_shades():
    """Get all shade recipes"""
    shades = await db.shades.find().sort("shade_number", 1).to_list(1000)
    return [shade_helper(shade) for shade in shades]


@api_router.get("/shades/{shade_id}", response_model=Shade)
async def get_shade(shade_id: str):
    """Get a specific shade recipe"""
    try:
        shade = await db.shades.find_one({"_id": ObjectId(shade_id)})
        if not shade:
            raise HTTPException(status_code=404, detail="Shade not found")
        return shade_helper(shade)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/dye-names")
async def get_all_dye_names():
    """Get all unique dye names from existing shades for autocomplete"""
    try:
        # Aggregate to get all unique dye names
        pipeline = [
            {"$unwind": "$dyes"},
            {"$group": {"_id": "$dyes.dye_name"}},
            {"$sort": {"_id": 1}}
        ]
        result = await db.shades.aggregate(pipeline).to_list(1000)
        dye_names = [item["_id"] for item in result if item["_id"]]
        return {"dye_names": dye_names}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.put("/shades/{shade_id}", response_model=Shade)
async def update_shade(shade_id: str, shade_update: ShadeUpdate):
    """Update a shade recipe"""
    try:
        update_data = {k: v for k, v in shade_update.dict().items() if v is not None}
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No update data provided")
        
        result = await db.shades.update_one(
            {"_id": ObjectId(shade_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Shade not found")
        
        updated_shade = await db.shades.find_one({"_id": ObjectId(shade_id)})
        return shade_helper(updated_shade)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.delete("/shades/{shade_id}")
async def delete_shade(shade_id: str):
    """Delete a shade recipe"""
    try:
        result = await db.shades.delete_one({"_id": ObjectId(shade_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Shade not found")
        
        return {"message": "Shade deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/calculate", response_model=CalculateResponse)
async def calculate_recipe(request: CalculateRequest):
    """Calculate scaled recipe for a specific machine weight"""
    try:
        shade = await db.shades.find_one({"_id": ObjectId(request.shade_id)})
        
        if not shade:
            raise HTTPException(status_code=404, detail="Shade not found")
        
        original_weight = shade["original_weight"]
        target_weight = request.target_weight
        
        scaled_dyes = []
        for dye in shade["dyes"]:
            per_kg = dye["quantity"] / original_weight
            scaled_quantity = per_kg * target_weight
            
            scaled_dyes.append({
                "dye_name": dye["dye_name"],
                "original_quantity": dye["quantity"],
                "per_kg": round(per_kg, 2),
                "scaled_quantity": round(scaled_quantity, 2)
            })
        
        return {
            "shade_number": shade["shade_number"],
            "original_weight": original_weight,
            "target_weight": target_weight,
            "scaled_dyes": scaled_dyes
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/calculate-all-machines", response_model=AllMachinesCalculation)
async def calculate_all_machines(shade_id: str):
    """Calculate recipe for all machine capacities"""
    try:
        shade = await db.shades.find_one({"_id": ObjectId(shade_id)})
        
        if not shade:
            raise HTTPException(status_code=404, detail="Shade not found")
        
        original_weight = shade["original_weight"]
        machine_weights = [6, 10.5, 12, 15, 24]
        
        machines_data = {}
        
        for machine_weight in machine_weights:
            scaled_dyes = []
            for dye in shade["dyes"]:
                per_kg = dye["quantity"] / original_weight
                scaled_quantity = per_kg * machine_weight
                
                scaled_dyes.append({
                    "dye_name": dye["dye_name"],
                    "quantity": round(scaled_quantity, 2)
                })
            
            machines_data[str(machine_weight)] = scaled_dyes
        
        return {
            "shade_number": shade["shade_number"],
            "original_weight": original_weight,
            "machines": machines_data
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Cart Sync Endpoints
@api_router.get("/cart/{user_id}")
async def get_cart(user_id: str):
    """Retrieve cart for a specific user"""
    try:
        cart = await db.carts.find_one({"user_id": user_id})
        if not cart:
            return {"user_id": user_id, "items": []}
        return {
            "user_id": cart["user_id"], 
            "items": cart.get("items", [])
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/cart/{user_id}")
async def save_cart(user_id: str, items: List[CartItemModel]):
    """Save/Sync cart for a specific user"""
    try:
        cart_dict = {
            "user_id": user_id,
            "items": [item.dict() for item in items],
            "updated_at": datetime.utcnow()
        }
        await db.carts.update_one(
            {"user_id": user_id},
            {"$set": cart_dict},
            upsert=True
        )
        return {"message": "Cart synced successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Daily Task endpoints
def daily_task_helper(task) -> dict:
    return {
        "id": str(task["_id"]),
        "date": task["date"],
        "m1": task.get("m1"),
        "m2": task.get("m2"),
        "m3": task.get("m3"),
        "m4": task.get("m4"),
        "m5": task.get("m5"),
        "m6": task.get("m6"),
        "m7": task.get("m7"),
        "m8": task.get("m8"),
        "m9": task.get("m9"),
        "m10": task.get("m10"),
        "m11": task.get("m11"),
        "automatic_tasks": task.get("automatic_tasks", []),
        "created_at": task.get("created_at")
    }


@api_router.post("/daily-tasks", response_model=DailyTask)
async def create_daily_task(task: DailyTaskCreate):
    """Create or update a daily task by date"""
    task_dict = task.dict()
    task_dict["created_at"] = datetime.utcnow()
    
    # Check if a task for this date already exists
    existing_task = await db.daily_tasks.find_one({"date": task.date})
    if existing_task:
        # Update existing task
        await db.daily_tasks.update_one(
            {"date": task.date},
            {"$set": task_dict}
        )
        updated_task = await db.daily_tasks.find_one({"date": task.date})
        return daily_task_helper(updated_task)
    
    # Create new task
    result = await db.daily_tasks.insert_one(task_dict)
    created_task = await db.daily_tasks.find_one({"_id": result.inserted_id})
    return daily_task_helper(created_task)


@api_router.get("/daily-tasks", response_model=List[DailyTask])
async def get_daily_tasks():
    """Get all daily tasks"""
    tasks = await db.daily_tasks.find().sort("date", -1).to_list(1000)
    return [daily_task_helper(task) for task in tasks]


@api_router.get("/daily-tasks/{date}")
async def get_daily_task_by_date(date: str):
    """Get daily task by date"""
    task = await db.daily_tasks.find_one({"date": date})
    if not task:
        return {"message": "No task found for this date"}
    return daily_task_helper(task)


@api_router.put("/daily-tasks/{task_id}", response_model=DailyTask)
async def update_daily_task(task_id: str, task_update: DailyTaskCreate):
    """Update a daily task"""
    try:
        update_data = task_update.dict()
        
        result = await db.daily_tasks.update_one(
            {"_id": ObjectId(task_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        
        updated_task = await db.daily_tasks.find_one({"_id": ObjectId(task_id)})
        return daily_task_helper(updated_task)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.delete("/daily-tasks/{task_id}")
async def delete_daily_task(task_id: str):
    """Delete a daily task"""
    try:
        result = await db.daily_tasks.delete_one({"_id": ObjectId(task_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        
        return {"message": "Task deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/daily-tasks/{task_id}/pdf")
async def generate_daily_task_pdf(task_id: str, assigned_to: Optional[str] = None):
    """Generate PDF for a daily task, optionally filtered by dyeing master"""
    try:
        task = await db.daily_tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # Machine capacities
        machine_info = {
            'm1': {'name': 'M1', 'capacity': 10.5, 'springs': 7},
            'm2': {'name': 'M2', 'capacity': 12, 'springs': 8},
            'm3': {'name': 'M3', 'capacity': 12, 'springs': 8},
            'm4': {'name': 'M4', 'capacity': 6, 'springs': 4},
            'm5': {'name': 'M5', 'capacity': 24, 'springs': 16},
            'm6': {'name': 'M6', 'capacity': 15, 'springs': 10},
            'm7': {'name': 'M7', 'capacity': 15, 'springs': 10},
            'm8': {'name': 'M8', 'capacity': 12, 'springs': 8},
            'm9': {'name': 'M9', 'capacity': 12, 'springs': 8},
            'm10': {'name': 'M10', 'capacity': 6, 'springs': 4},
            'm11': {'name': 'M11', 'capacity': 6, 'springs': 4},
        }
        
        # Create PDF buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
        elements = []
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=20,
            spaceAfter=20,
            alignment=1  # Center
        )
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=10,
            alignment=1
        )
        machine_style = ParagraphStyle(
            'MachineTitle',
            parent=styles['Heading3'],
            fontSize=12,
            spaceBefore=15,
            spaceAfter=5,
            textColor=colors.darkgreen
        )
        
        # Title
        elements.append(Paragraph("Bajaj Dyeing Unit - Daily Task", title_style))
        elements.append(Paragraph(f"Date: {task['date']}", subtitle_style))
        elements.append(Spacer(1, 20))
        
        # Machine tasks
        automatic_tasks = task.get("automatic_tasks", [])

        for machine_key in ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']:
            machine_tasks = task.get(machine_key, [])
            auto_for_machine = [t for t in automatic_tasks if t.get("machine") == machine_key]
            combined_tasks = machine_tasks + auto_for_machine
            
            if assigned_to:
                combined_tasks = [t for t in combined_tasks if t.get('assigned_to') == assigned_to or (assigned_to == 'user1' and not t.get('assigned_to'))]
            
            info = machine_info[machine_key]
            
            elements.append(Paragraph(
                f"{info['name']} - Capacity: {info['capacity']}kg, Springs: {info['springs']}", 
                machine_style
            ))
            
            if not combined_tasks:
                elements.append(Paragraph("No tasks assigned", styles['Normal']))
            else:
                # Table data
                table_data = [['#', 'Shade', 'Type', '2PLY', '3PLY', 'Total', 'Status']]
                for idx, t in enumerate(combined_tasks):
                    status = t.get('status', 'pending').upper()
                    m_type = t.get('type', 'manual')
                    table_data.append([
                        str(idx + 1),
                        f"#{t.get('shade_number', 'N/A')}",
                        "Auto" if m_type == "automatic" else "Man",
                        str(t.get('springs_2ply', 0)),
                        str(t.get('springs_3ply', 0)),
                        str(t.get('springs_2ply', 0) + t.get('springs_3ply', 0)),
                        status
                    ])
                
                table = Table(table_data, colWidths=[30, 60, 40, 40, 40, 40, 70])
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.darkgreen),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                ]))
                elements.append(table)
            
            elements.append(Spacer(1, 10))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=daily_task_{task['date']}.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/daily-tasks/{task_id}/whatsapp-text")
async def get_whatsapp_text(task_id: str, assigned_to: Optional[str] = None):
    """Generate WhatsApp shareable text for a daily task, optionally filtered by dyeing master"""
    try:
        task = await db.daily_tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        machine_info = {
            'm1': {'name': 'M1', 'capacity': 10.5},
            'm2': {'name': 'M2', 'capacity': 12},
            'm3': {'name': 'M3', 'capacity': 12},
            'm4': {'name': 'M4', 'capacity': 6},
            'm5': {'name': 'M5', 'capacity': 24},
            'm6': {'name': 'M6', 'capacity': 15},
            'm7': {'name': 'M7', 'capacity': 15},
            'm8': {'name': 'M8', 'capacity': 12},
            'm9': {'name': 'M9', 'capacity': 12},
            'm10': {'name': 'M10', 'capacity': 6},
            'm11': {'name': 'M11', 'capacity': 6},
        }
        
        master_title = ""
        if assigned_to == 'user1':
            master_title = " (Dyeing Master 1)"
        elif assigned_to == 'user2':
            master_title = " (Dyeing Master 2)"

        # Build message
        message = f"🎨 *Bajaj Dyeing Unit - Daily Task{master_title}*\n"
        message += f"📅 *Date:* {task['date']}\n"
        message += "─" * 25 + "\n\n"
        
        automatic_tasks = task.get("automatic_tasks", [])

        for machine_key in ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']:
            machine_tasks = task.get(machine_key, [])
            auto_for_machine = [t for t in automatic_tasks if t.get("machine") == machine_key]
            combined_tasks = machine_tasks + auto_for_machine
            
            if assigned_to:
                combined_tasks = [t for t in combined_tasks if t.get('assigned_to') == assigned_to or (assigned_to == 'user1' and not t.get('assigned_to'))]
            
            info = machine_info[machine_key]
            
            if combined_tasks:
                message += f"🏭 *{info['name']}* ({info['capacity']}kg)\n"
                for idx, t in enumerate(combined_tasks):
                    shade = t.get('shade_number', 'N/A')
                    ply2 = t.get('springs_2ply', 0)
                    ply3 = t.get('springs_3ply', 0)
                    total = ply2 + ply3
                    message += f"   {idx+1}. Shade #{shade}\n"
                    message += f"      2PLY: {ply2} | 3PLY: {ply3} | Total: {total}\n"
                message += "\n"
        
        message += "─" * 25 + "\n"
        message += "✅ Please complete tasks on time!"
        
        return {"text": message}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.put("/daily-tasks/{task_id}/update-machine-task")
async def update_machine_task(
    task_id: str,
    machine_id: str,
    machine_task_id: str,
    ply2_weight: Optional[float] = None,
    ply3_weight: Optional[float] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    completed_at: Optional[str] = None,
    duration: Optional[str] = None,
    status: Optional[str] = None,
    shade_number: Optional[str] = None,
    original_shade_number: Optional[str] = None,
    is_modified: Optional[bool] = None,
    assigned_to: Optional[str] = None,
):
    """Update a specific machine task (weight, timing, status)"""
    try:
        daily_task = await db.daily_tasks.find_one({"_id": ObjectId(task_id)})
        if not daily_task:
            raise HTTPException(status_code=404, detail="Daily task not found")
        
        machine_tasks = daily_task.get(machine_id, [])
        
        # Find task by id instead of index
        task_index = -1
        for i, t in enumerate(machine_tasks):
            if t.get('id') == machine_task_id:
                task_index = i
                break
                
        # Fallback to index if not found by ID (for legacy tasks without IDs)
        if task_index == -1:
            try:
                idx = int(machine_task_id)
                if 0 <= idx < len(machine_tasks):
                    task_index = idx
            except ValueError:
                pass
                
        if task_index == -1:
            raise HTTPException(status_code=404, detail="Machine task not found")
        
        # Update task fields - handle reset (empty string means reset to null)
        if ply2_weight is not None:
            machine_tasks[task_index]["ply2_weight"] = ply2_weight
        if ply3_weight is not None:
            machine_tasks[task_index]["ply3_weight"] = ply3_weight
        if start_time is not None:
            machine_tasks[task_index]["start_time"] = start_time if start_time else None
        if end_time is not None:
            machine_tasks[task_index]["end_time"] = end_time if end_time else None
        if completed_at is not None:
            machine_tasks[task_index]["completed_at"] = completed_at if completed_at else None
        if duration is not None:
            machine_tasks[task_index]["duration"] = duration if duration else None
        if status is not None:
            # Prevent Black return from being rejected
            if status == 'rejected':
                shade_num = str(machine_tasks[task_index].get('shade_number', '')).lower()
                if 'black return' in shade_num:
                    raise HTTPException(status_code=400, detail="Black return tasks cannot be rejected")
            
            machine_tasks[task_index]["status"] = status
            # Automatically clear times when resetting to pending
            if status == 'pending':
                machine_tasks[task_index]["start_time"] = None
                machine_tasks[task_index]["end_time"] = None
                machine_tasks[task_index]["completed_at"] = None
                machine_tasks[task_index]["duration"] = None
        if shade_number is not None:
            machine_tasks[task_index]["shade_number"] = shade_number
        if original_shade_number is not None:
            machine_tasks[task_index]["original_shade_number"] = original_shade_number
        if is_modified is not None:
            machine_tasks[task_index]["is_modified"] = is_modified
        if assigned_to is not None:
            machine_tasks[task_index]["assigned_to"] = assigned_to
        
        # Update in database
        await db.daily_tasks.update_one(
            {"_id": ObjectId(task_id)},
            {"$set": {machine_id: machine_tasks}}
        )
        
        return {"message": "Task updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class PaymentRatesUpdate(BaseModel):
    normal_rate: float = 8.0
    rejected_rate: float = 8.0
    black_return_rate: float = 4.0
    effective_date: Optional[str] = None


async def get_rates_for_date(target_date: str):
    """Retrieve the rates effective on a specific date (YYYY-MM-DD)"""
    rates_doc = await db.settings.find_one({"type": "payment_rates"})
    if not rates_doc:
        return {
            "normal_rate": 8.0,
            "rejected_rate": 8.0,
            "black_return_rate": 4.0,
            "effective_date": "2020-01-01"
        }
    
    history = rates_doc.get("history", [])
    if history:
        # Sort descending by effective_date
        sorted_history = sorted(history, key=lambda x: str(x.get("effective_date", "")), reverse=True)
        for entry in sorted_history:
            if str(entry.get("effective_date", "")) <= str(target_date):
                return {
                    "normal_rate": float(entry.get("normal_rate", 8.0)),
                    "rejected_rate": float(entry.get("rejected_rate", 8.0)),
                    "black_return_rate": float(entry.get("black_return_rate", 4.0)),
                    "effective_date": entry.get("effective_date")
                }
        # If target_date is older than earliest history entry, return earliest history entry
        earliest = sorted_history[-1]
        return {
            "normal_rate": float(earliest.get("normal_rate", 8.0)),
            "rejected_rate": float(earliest.get("rejected_rate", 8.0)),
            "black_return_rate": float(earliest.get("black_return_rate", 4.0)),
            "effective_date": earliest.get("effective_date")
        }
    
    # Fallback to top-level rates
    return {
        "normal_rate": float(rates_doc.get("normal_rate", 8.0)),
        "rejected_rate": float(rates_doc.get("rejected_rate", 8.0)),
        "black_return_rate": float(rates_doc.get("black_return_rate", 4.0)),
        "effective_date": rates_doc.get("effective_date", "2020-01-01")
    }


@api_router.get("/settings/rates")
async def get_payment_rates(date: Optional[str] = None):
    """Fetch current dynamic payment rates set by owner, optionally for a specific date"""
    rates_doc = await db.settings.find_one({"type": "payment_rates"})
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")
    current = await get_rates_for_date(target_date)
    history = rates_doc.get("history", []) if rates_doc else []
    sorted_history = sorted(history, key=lambda x: str(x.get("effective_date", "")), reverse=True)
    return {
        "normal_rate": current["normal_rate"],
        "rejected_rate": current["rejected_rate"],
        "black_return_rate": current["black_return_rate"],
        "effective_date": current.get("effective_date", target_date),
        "history": sorted_history
    }


@api_router.put("/settings/rates")
async def update_payment_rates(rates: PaymentRatesUpdate):
    """Update dynamic payment rates with an effective start date to protect past payments"""
    try:
        effective_date = rates.effective_date.strip() if (rates.effective_date and rates.effective_date.strip()) else datetime.utcnow().strftime("%Y-%m-%d")
        rates_doc = await db.settings.find_one({"type": "payment_rates"})
        history = rates_doc.get("history", []) if rates_doc else []
        
        # If history was empty, add initial baseline if effective_date > 2020-01-01
        if not history and effective_date > "2020-01-01":
            history.append({
                "effective_date": "2020-01-01",
                "normal_rate": float(rates_doc.get("normal_rate", 8.0)) if rates_doc else 8.0,
                "rejected_rate": float(rates_doc.get("rejected_rate", 8.0)) if rates_doc else 8.0,
                "black_return_rate": float(rates_doc.get("black_return_rate", 4.0)) if rates_doc else 4.0,
                "updated_at": datetime.utcnow().isoformat()
            })

        # Check if an entry for this exact effective_date already exists
        existing_idx = -1
        for i, entry in enumerate(history):
            if entry.get("effective_date") == effective_date:
                existing_idx = i
                break
                
        new_entry = {
            "effective_date": effective_date,
            "normal_rate": rates.normal_rate,
            "rejected_rate": rates.rejected_rate,
            "black_return_rate": rates.black_return_rate,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if existing_idx >= 0:
            history[existing_idx] = new_entry
        else:
            history.append(new_entry)
            
        await db.settings.update_one(
            {"type": "payment_rates"},
            {"$set": {
                "type": "payment_rates",
                "normal_rate": rates.normal_rate,
                "rejected_rate": rates.rejected_rate,
                "black_return_rate": rates.black_return_rate,
                "effective_date": effective_date,
                "history": history,
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        return {"message": "Payment rates updated successfully", "rates": new_entry}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/daily-tasks/{task_id}/payment-calculation")
async def calculate_payment(task_id: str, assigned_to: Optional[str] = None):
    """Calculate payment for completed tasks based on machine capacity & rates effective on the task date"""
    try:
        daily_task = await db.daily_tasks.find_one({"_id": ObjectId(task_id)})
        if not daily_task:
            raise HTTPException(status_code=404, detail="Daily task not found")
        
        task_date = str(daily_task.get("date", datetime.utcnow().strftime("%Y-%m-%d")))
        
        # Fetch dynamic rates effective on the task's specific date
        active_rates = await get_rates_for_date(task_date)
        normal_rate = active_rates["normal_rate"]
        rejected_rate = active_rates["rejected_rate"]
        black_return_rate = active_rates["black_return_rate"]

        # Machine capacities in kg
        machine_capacities = {
            'm1': 10.5,
            'm2': 12,
            'm3': 12,
            'm4': 6,
            'm5': 24,
            'm6': 15,
            'm7': 15,
            'm8': 12,
            'm9': 12,
            'm10': 6,
            'm11': 6,
        }
        
        normal_completed_kg = 0
        black_return_kg = 0
        rejected_kg = 0

        normal_completed_tasks = 0
        black_return_tasks = 0
        rejected_tasks = 0
        
        automatic_tasks = daily_task.get("automatic_tasks", [])

        for machine_id, capacity in machine_capacities.items():
            tasks = daily_task.get(machine_id, [])
            auto_for_machine = [t for t in automatic_tasks if t.get("machine") == machine_id]
            combined_tasks = tasks + auto_for_machine
            
            if assigned_to:
                combined_tasks = [t for t in combined_tasks if t.get('assigned_to') == assigned_to or (assigned_to == 'user1' and not t.get('assigned_to'))]
            
            for task in combined_tasks:
                shade_num = str(task.get('shade_number', '')).lower()
                is_black_return = 'black return' in shade_num
                
                if task.get('status') == 'completed':
                    if is_black_return:
                        # Black return completed
                        black_return_kg += capacity
                        black_return_tasks += 1
                    else:
                        # Normal completed
                        normal_completed_kg += capacity
                        normal_completed_tasks += 1
                elif task.get('status') == 'rejected':
                    # Rejected task
                    rejected_kg += capacity
                    rejected_tasks += 1
        
        # Calculations
        normal_completed_payment = normal_completed_kg * normal_rate
        black_return_payment = black_return_kg * black_return_rate
        rejected_payment = rejected_kg * rejected_rate
        
        total_payment = normal_completed_payment + black_return_payment + rejected_payment
        total_kg = normal_completed_kg + black_return_kg + rejected_kg
        completed_kg = normal_completed_kg + black_return_kg
        completed_payment = normal_completed_payment + black_return_payment
        completed_tasks = normal_completed_tasks + black_return_tasks
        
        return {
            "total_kg": round(total_kg, 2),
            "completed_kg": round(completed_kg, 2),
            "normal_completed_kg": round(normal_completed_kg, 2),
            "black_return_kg": round(black_return_kg, 2),
            "rejected_kg": round(rejected_kg, 2),
            "normal_rate": normal_rate,
            "rejected_rate": rejected_rate,
            "black_return_rate": black_return_rate,
            "rate_per_kg": normal_rate,
            "half_rate": black_return_rate,
            "normal_completed_payment": round(normal_completed_payment, 2),
            "black_return_payment": round(black_return_payment, 2),
            "completed_payment": round(completed_payment, 2),
            "rejected_payment": round(rejected_payment, 2),
            "total_payment": round(total_payment, 2),
            "normal_completed_tasks": normal_completed_tasks,
            "black_return_tasks": black_return_tasks,
            "completed_tasks": completed_tasks,
            "rejected_tasks": rejected_tasks
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/daily-tasks/rollover-pending")
async def rollover_pending_tasks(from_date: str, to_date: str):
    """Move pending tasks from one date to another (auto-rollover)"""
    try:
        # Get tasks from source date
        from_task = await db.daily_tasks.find_one({"date": from_date})
        if not from_task:
            return {"message": "No tasks found for source date", "moved": 0}
        
        # Get or create tasks for target date
        to_task = await db.daily_tasks.find_one({"date": to_date})
        
        machines = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']
        moved_count = 0
        
        # 1. Rollover Manual Tasks
        for machine_id in machines:
            source_tasks = from_task.get(machine_id, [])
            # Get only pending tasks
            pending_tasks = [t for t in source_tasks if t.get('status', 'pending') == 'pending']
            
            if pending_tasks:
                for task in pending_tasks:
                    task["carried_forward"] = True
                    if "original_date" not in task or not task["original_date"]:
                        task["original_date"] = from_date

                if to_task:
                    # PREPEND to existing tasks (pending tasks first, then new tasks)
                    existing_tasks = to_task.get(machine_id, [])
                    updated_tasks = pending_tasks + existing_tasks  # Reversed order
                    await db.daily_tasks.update_one(
                        {"_id": to_task["_id"]},
                        {"$set": {machine_id: updated_tasks}}
                    )
                else:
                    # Create new task for target date
                    new_task = {
                        "date": to_date,
                        "created_at": datetime.utcnow(),
                        machine_id: pending_tasks
                    }
                    result = await db.daily_tasks.insert_one(new_task)
                    to_task = await db.daily_tasks.find_one({"_id": result.inserted_id})
                
                moved_count += len(pending_tasks)
                
                # Remove pending tasks from source date
                remaining_tasks = [t for t in source_tasks if t.get('status', 'pending') != 'pending']
                await db.daily_tasks.update_one(
                    {"_id": from_task["_id"]},
                    {"$set": {machine_id: remaining_tasks}}
                )

        # 2. Rollover Automatic Tasks
        source_auto_tasks = from_task.get("automatic_tasks", [])
        pending_auto_tasks = [t for t in source_auto_tasks if t.get('status', 'pending') == 'pending']
        if pending_auto_tasks:
            for task in pending_auto_tasks:
                task["carried_forward"] = True
                if "original_date" not in task or not task["original_date"]:
                    task["original_date"] = from_date

            if to_task:
                existing_auto = to_task.get("automatic_tasks", [])
                updated_auto = pending_auto_tasks + existing_auto
                await db.daily_tasks.update_one(
                    {"_id": to_task["_id"]},
                    {"$set": {"automatic_tasks": updated_auto}}
                )
            else:
                new_task = {
                    "date": to_date,
                    "created_at": datetime.utcnow(),
                    "automatic_tasks": pending_auto_tasks
                }
                result = await db.daily_tasks.insert_one(new_task)
                to_task = await db.daily_tasks.find_one({"_id": result.inserted_id})
            
            moved_count += len(pending_auto_tasks)
            remaining_auto = [t for t in source_auto_tasks if t.get('status', 'pending') != 'pending']
            await db.daily_tasks.update_one(
                {"_id": from_task["_id"]},
                {"$set": {"automatic_tasks": remaining_auto}}
            )
        
        return {
            "message": f"Moved {moved_count} pending tasks from {from_date} to {to_date}",
            "moved": moved_count
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
