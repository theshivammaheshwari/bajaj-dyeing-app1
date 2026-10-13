from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
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


class ManualStockCreate(BaseModel):
    shade_number: str
    ply2_kg: float = 0.0
    ply3_kg: float = 0.0
    date: Optional[str] = None  # YYYY-MM-DD
    notes: Optional[str] = "Manual entry"


class ManualStockUpdate(BaseModel):
    shade_number: Optional[str] = None
    ply2_kg: Optional[float] = None
    ply3_kg: Optional[float] = None
    date: Optional[str] = None
    notes: Optional[str] = None


class ModifyPendingTaskRequest(BaseModel):
    daily_task_id: str
    machine_id: str  # m1...m11 or automatic_tasks
    lot_id: str
    shade_number: Optional[str] = None
    springs_2ply: Optional[int] = None
    springs_3ply: Optional[int] = None
    ply2_weight: Optional[float] = None
    ply3_weight: Optional[float] = None
    weight: Optional[float] = None


class AdjustSpringsRequest(BaseModel):
    shade_number: str
    ply_type: str = "2ply"  # "2ply" or "3ply" or "both"
    action: str = "increment"  # "increment", "decrement", "set"
    delta: Optional[int] = 1
    value: Optional[int] = None
    springs_2ply: Optional[int] = None
    springs_3ply: Optional[int] = None


def safe_float(val, default=0.0) -> float:
    try:
        if val is None or val == "":
            return default
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_int(val, default=0) -> int:
    try:
        if val is None or val == "":
            return default
        return int(float(val))
    except (ValueError, TypeError):
        return default


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
        return {"dye_names": dye_names}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/shades/batch-history/{shade_number}")
@api_router.get("/shades/{shade_number}/batch-history")
async def get_shade_batch_history(shade_number: str):
    """Retrieve full batch history for a specific shade across all daily tasks (dates, machines, 2ply, 3ply, weights, status)"""
    try:
        clean_shade = str(shade_number).strip().lower().lstrip("#")
        
        # Search all daily tasks
        daily_tasks_cursor = db.daily_tasks.find({})
        daily_tasks = await daily_tasks_cursor.to_list(10000)
        
        machines = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']
        batches = []
        
        for dt in daily_tasks:
            dt_date = dt.get("date", "")
            
            # 1. Manual Machine Tasks
            for machine_id in machines:
                tasks = dt.get(machine_id, [])
                for t in tasks:
                    t_sn = str(t.get('shade_number', '')).strip().lower().lstrip("#")
                    if t_sn == clean_shade:
                        s2 = int(t.get("springs_2ply", 0) or 0)
                        s3 = int(t.get("springs_3ply", 0) or 0)
                        batches.append({
                            "task_id": str(t.get("id", "")),
                            "date": dt_date,
                            "machine": machine_id.upper(),
                            "shade_number": str(t.get('shade_number', '')),
                            "springs_2ply": s2,
                            "springs_3ply": s3,
                            "total_springs": s2 + s3,
                            "weight": float(t.get("weight", 0) or 0),
                            "ply2_weight": float(t.get("ply2_weight", 0) or 0),
                            "ply3_weight": float(t.get("ply3_weight", 0) or 0),
                            "status": t.get("status", "pending"),
                            "assigned_to": t.get("assigned_to", "user1"),
                            "type": "manual",
                            "completed_at": t.get("completed_at"),
                            "start_time": t.get("start_time"),
                            "end_time": t.get("end_time")
                        })
            
            # 2. Automatic Tasks
            auto_tasks = dt.get("automatic_tasks", [])
            for t in auto_tasks:
                t_sn = str(t.get('shade_number', '')).strip().lower().lstrip("#")
                if t_sn == clean_shade:
                    s2 = int(t.get("springs_2ply", 0) or 0)
                    s3 = int(t.get("springs_3ply", 0) or 0)
                    m_label = str(t.get("machine", "AUTO")).upper()
                    batches.append({
                        "task_id": str(t.get("id", "")),
                        "date": dt_date,
                        "machine": m_label,
                        "shade_number": str(t.get('shade_number', '')),
                        "springs_2ply": s2,
                        "springs_3ply": s3,
                        "total_springs": s2 + s3,
                        "weight": float(t.get("weight", 0) or 0),
                        "ply2_weight": float(t.get("ply2_weight", 0) or 0),
                        "ply3_weight": float(t.get("ply3_weight", 0) or 0),
                        "status": t.get("status", "pending"),
                        "assigned_to": t.get("assigned_to", "user1"),
                        "type": "automatic",
                        "completed_at": t.get("completed_at"),
                        "start_time": t.get("start_time"),
                        "end_time": t.get("end_time")
                    })
        
        # Sort batches descending by date
        batches.sort(key=lambda x: str(x.get("date", "")), reverse=True)
        
        history_2ply = [b for b in batches if b["springs_2ply"] > 0]
        history_3ply = [b for b in batches if b["springs_3ply"] > 0]
        
        last_batch_date = batches[0]["date"] if batches else None
        last_batch_machine = batches[0]["machine"] if batches else None
        last_2ply_date = history_2ply[0]["date"] if history_2ply else None
        last_3ply_date = history_3ply[0]["date"] if history_3ply else None
        
        return {
            "shade_number": shade_number,
            "found": len(batches) > 0,
            "last_batch_date": last_batch_date,
            "last_batch_machine": last_batch_machine,
            "last_2ply_date": last_2ply_date,
            "last_3ply_date": last_3ply_date,
            "total_batches": len(batches),
            "total_2ply_batches": len(history_2ply),
            "total_3ply_batches": len(history_3ply),
            "total_2ply_springs": sum(b["springs_2ply"] for b in batches),
            "total_3ply_springs": sum(b["springs_3ply"] for b in batches),
            "total_springs": sum(b["total_springs"] for b in batches),
            "total_weight": round(sum(b["weight"] for b in batches), 2),
            "total_completed_batches": len([b for b in batches if b["status"] == "completed"]),
            "batches": batches,
            "history_2ply": history_2ply,
            "history_3ply": history_3ply
        }
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
    master: Optional[str] = "user1"  # "user1" or "user2"
    normal_rate: float = 8.0
    rejected_rate: float = 8.0
    black_return_rate: float = 4.0
    effective_date: Optional[str] = None


async def get_rates_for_date(target_date: str, master: Optional[str] = "user1"):
    """Retrieve the rates effective on a specific date (YYYY-MM-DD) for a specific dyeing master (user1/user2)"""
    m = master if master in ["user1", "user2"] else "user1"
    rates_doc = await db.settings.find_one({"type": f"payment_rates_{m}"})
    if not rates_doc and m == "user1":
        # Fallback to legacy payment_rates document
        rates_doc = await db.settings.find_one({"type": "payment_rates"})
    
    if not rates_doc:
        return {
            "master": m,
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
                    "master": m,
                    "normal_rate": float(entry.get("normal_rate", 8.0)),
                    "rejected_rate": float(entry.get("rejected_rate", 8.0)),
                    "black_return_rate": float(entry.get("black_return_rate", 4.0)),
                    "effective_date": entry.get("effective_date")
                }
        # If target_date is older than earliest history entry, return earliest history entry
        earliest = sorted_history[-1]
        return {
            "master": m,
            "normal_rate": float(earliest.get("normal_rate", 8.0)),
            "rejected_rate": float(earliest.get("rejected_rate", 8.0)),
            "black_return_rate": float(earliest.get("black_return_rate", 4.0)),
            "effective_date": earliest.get("effective_date")
        }
    
    # Fallback to top-level rates
    return {
        "master": m,
        "normal_rate": float(rates_doc.get("normal_rate", 8.0)),
        "rejected_rate": float(rates_doc.get("rejected_rate", 8.0)),
        "black_return_rate": float(rates_doc.get("black_return_rate", 4.0)),
        "effective_date": rates_doc.get("effective_date", "2020-01-01")
    }


@api_router.get("/settings/rates")
async def get_payment_rates(date: Optional[str] = None, master: Optional[str] = "user1"):
    """Fetch current dynamic payment rates set by owner for a specific dyeing master, optionally for a specific date"""
    m = master if master in ["user1", "user2"] else "user1"
    rates_doc = await db.settings.find_one({"type": f"payment_rates_{m}"})
    if not rates_doc and m == "user1":
        rates_doc = await db.settings.find_one({"type": "payment_rates"})
        
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")
    current = await get_rates_for_date(target_date, master=m)
    history = rates_doc.get("history", []) if rates_doc else []
    sorted_history = sorted(history, key=lambda x: str(x.get("effective_date", "")), reverse=True)
    return {
        "master": m,
        "normal_rate": current["normal_rate"],
        "rejected_rate": current["rejected_rate"],
        "black_return_rate": current["black_return_rate"],
        "effective_date": current.get("effective_date", target_date),
        "history": sorted_history
    }


@api_router.put("/settings/rates")
async def update_payment_rates(rates: PaymentRatesUpdate):
    """Update dynamic payment rates for a specific dyeing master with an effective start date to protect past payments"""
    try:
        m = rates.master if rates.master in ["user1", "user2"] else "user1"
        effective_date = rates.effective_date.strip() if (rates.effective_date and rates.effective_date.strip()) else datetime.utcnow().strftime("%Y-%m-%d")
        
        doc_type = f"payment_rates_{m}"
        rates_doc = await db.settings.find_one({"type": doc_type})
        if not rates_doc and m == "user1":
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
            
        save_data = {
            "type": doc_type,
            "master": m,
            "normal_rate": rates.normal_rate,
            "rejected_rate": rates.rejected_rate,
            "black_return_rate": rates.black_return_rate,
            "effective_date": effective_date,
            "history": history,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        await db.settings.update_one(
            {"type": doc_type},
            {"$set": save_data},
            upsert=True
        )
        
        # If updating user1, also keep generic payment_rates doc synchronized
        if m == "user1":
            legacy_data = dict(save_data)
            legacy_data["type"] = "payment_rates"
            await db.settings.update_one(
                {"type": "payment_rates"},
                {"$set": legacy_data},
                upsert=True
            )
            
        return {"message": f"Payment rates updated successfully for {m}", "rates": new_entry, "master": m}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/daily-tasks/{task_id}/payment-calculation")
async def calculate_payment(task_id: str, assigned_to: Optional[str] = None):
    """Calculate payment for completed tasks based on machine capacity & master-specific rates effective on the task date"""
    try:
        daily_task = await db.daily_tasks.find_one({"_id": ObjectId(task_id)})
        if not daily_task:
            raise HTTPException(status_code=404, detail="Daily task not found")
        
        task_date = str(daily_task.get("date", datetime.utcnow().strftime("%Y-%m-%d")))
        
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
        
        if assigned_to:
            target_master = 'user2' if assigned_to == 'user2' else 'user1'
            active_rates = await get_rates_for_date(task_date, master=target_master)
            normal_rate = active_rates["normal_rate"]
            rejected_rate = active_rates["rejected_rate"]
            black_return_rate = active_rates["black_return_rate"]
            
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
                
                # Filter for this master
                combined_tasks = [t for t in combined_tasks if t.get('assigned_to') == target_master or (target_master == 'user1' and not t.get('assigned_to'))]
                
                for task in combined_tasks:
                    shade_num = str(task.get('shade_number', '')).lower()
                    is_black_return = 'black return' in shade_num
                    
                    if task.get('status') == 'completed':
                        if is_black_return:
                            black_return_kg += capacity
                            black_return_tasks += 1
                        else:
                            normal_completed_kg += capacity
                            normal_completed_tasks += 1
                    elif task.get('status') == 'rejected':
                        rejected_kg += capacity
                        rejected_tasks += 1
            
            normal_completed_payment = normal_completed_kg * normal_rate
            black_return_payment = black_return_kg * black_return_rate
            rejected_payment = rejected_kg * rejected_rate
            
            total_payment = normal_completed_payment + black_return_payment + rejected_payment
            total_kg = normal_completed_kg + black_return_kg + rejected_kg
            completed_kg = normal_completed_kg + black_return_kg
            completed_payment = normal_completed_payment + black_return_payment
            completed_tasks = normal_completed_tasks + black_return_tasks
            
            return {
                "master": target_master,
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
        else:
            # Overall unit calculation across both masters
            rates_u1 = await get_rates_for_date(task_date, master="user1")
            rates_u2 = await get_rates_for_date(task_date, master="user2")
            
            normal_completed_kg = 0
            black_return_kg = 0
            rejected_kg = 0
            normal_completed_tasks = 0
            black_return_tasks = 0
            rejected_tasks = 0
            normal_completed_payment = 0.0
            black_return_payment = 0.0
            rejected_payment = 0.0
            
            automatic_tasks = daily_task.get("automatic_tasks", [])
            for machine_id, capacity in machine_capacities.items():
                tasks = daily_task.get(machine_id, [])
                auto_for_machine = [t for t in automatic_tasks if t.get("machine") == machine_id]
                combined_tasks = tasks + auto_for_machine
                
                for task in combined_tasks:
                    task_master = task.get('assigned_to') if task.get('assigned_to') == 'user2' else 'user1'
                    m_rates = rates_u2 if task_master == 'user2' else rates_u1
                    
                    shade_num = str(task.get('shade_number', '')).lower()
                    is_black_return = 'black return' in shade_num
                    
                    if task.get('status') == 'completed':
                        if is_black_return:
                            black_return_kg += capacity
                            black_return_tasks += 1
                            black_return_payment += capacity * m_rates["black_return_rate"]
                        else:
                            normal_completed_kg += capacity
                            normal_completed_tasks += 1
                            normal_completed_payment += capacity * m_rates["normal_rate"]
                    elif task.get('status') == 'rejected':
                        rejected_kg += capacity
                        rejected_tasks += 1
                        rejected_payment += capacity * m_rates["rejected_rate"]
            
            total_payment = normal_completed_payment + black_return_payment + rejected_payment
            total_kg = normal_completed_kg + black_return_kg + rejected_kg
            completed_kg = normal_completed_kg + black_return_kg
            completed_payment = normal_completed_payment + black_return_payment
            completed_tasks = normal_completed_tasks + black_return_tasks
            
            return {
                "master": "all",
                "total_kg": round(total_kg, 2),
                "completed_kg": round(completed_kg, 2),
                "normal_completed_kg": round(normal_completed_kg, 2),
                "black_return_kg": round(black_return_kg, 2),
                "rejected_kg": round(rejected_kg, 2),
                "normal_rate": rates_u1["normal_rate"],
                "rejected_rate": rates_u1["rejected_rate"],
                "black_return_rate": rates_u1["black_return_rate"],
                "rates_user1": rates_u1,
                "rates_user2": rates_u2,
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


@api_router.get("/reports/monthly-production")
async def get_monthly_production_report(year: Optional[str] = None, master: Optional[str] = None):
    """Generate month-wise dyeing analytics & consumption report (2-PLY kg, 3-PLY kg, Completed kg, Rejected kg)"""
    try:
        daily_tasks = await db.daily_tasks.find({}).to_list(10000)
        
        machine_capacities = {
            'm1': {'capacity': 10.5, 'total_springs': 7},
            'm2': {'capacity': 12.0, 'total_springs': 8},
            'm3': {'capacity': 12.0, 'total_springs': 8},
            'm4': {'capacity': 6.0, 'total_springs': 4},
            'm5': {'capacity': 24.0, 'total_springs': 16},
            'm6': {'capacity': 15.0, 'total_springs': 10},
            'm7': {'capacity': 15.0, 'total_springs': 10},
            'm8': {'capacity': 12.0, 'total_springs': 8},
            'm9': {'capacity': 12.0, 'total_springs': 8},
            'm10': {'capacity': 6.0, 'total_springs': 4},
            'm11': {'capacity': 6.0, 'total_springs': 4},
        }
        
        months_dict = {}
        available_years = set()
        
        for dt in daily_tasks:
            dt_date = str(dt.get("date", "")).strip()
            if not dt_date or len(dt_date) < 7:
                continue
            
            task_year = dt_date[:4]
            month_key = dt_date[:7]  # "YYYY-MM"
            available_years.add(task_year)
            
            if year and year != "all" and task_year != year:
                continue
                
            if month_key not in months_dict:
                # Format month name e.g. "October 2026"
                try:
                    m_date_obj = datetime.strptime(month_key, "%Y-%m")
                    m_label = m_date_obj.strftime("%B %Y")
                except Exception:
                    m_label = month_key
                    
                months_dict[month_key] = {
                    "month_key": month_key,
                    "month_name": m_label,
                    "year": task_year,
                    "completed_2ply_kg": 0.0,
                    "completed_3ply_kg": 0.0,
                    "completed_total_kg": 0.0,
                    "completed_springs_2ply": 0,
                    "completed_springs_3ply": 0,
                    "completed_batches": 0,
                    "rejected_2ply_kg": 0.0,
                    "rejected_3ply_kg": 0.0,
                    "rejected_total_kg": 0.0,
                    "rejected_springs_2ply": 0,
                    "rejected_springs_3ply": 0,
                    "rejected_batches": 0,
                    "pending_total_kg": 0.0,
                    "pending_batches": 0,
                    "dm1_completed_kg": 0.0,
                    "dm2_completed_kg": 0.0,
                    "dm1_rejected_kg": 0.0,
                    "dm2_rejected_kg": 0.0,
                }
            
            m_stat = months_dict[month_key]
            
            # 1. Manual Machine Tasks
            for machine_id, mc in machine_capacities.items():
                tasks = dt.get(machine_id) or []
                if not isinstance(tasks, list):
                    continue
                for t in tasks:
                    if not isinstance(t, dict):
                        continue
                    t_master = "user2" if t.get("assigned_to") == "user2" else "user1"
                    if master and master != "all" and t_master != master:
                        continue
                        
                    capacity = safe_float(mc.get('capacity'), 12.0)
                    tot_springs = safe_int(mc.get('total_springs'), 8)
                    kg_per_spring = capacity / tot_springs if tot_springs > 0 else 1.5
                    
                    s2 = safe_int(t.get("springs_2ply", 0))
                    s3 = safe_int(t.get("springs_3ply", 0))
                    
                    pw2 = safe_float(t.get("ply2_weight", 0))
                    w2 = pw2 if pw2 > 0 else (s2 * kg_per_spring)
                    
                    pw3 = safe_float(t.get("ply3_weight", 0))
                    w3 = pw3 if pw3 > 0 else (s3 * kg_per_spring)
                    
                    tot_w = (w2 + w3) if (w2 + w3) > 0 else safe_float(t.get("weight"), capacity)
                    status = str(t.get("status", "pending") or "pending").strip().lower()
                    
                    if status == "completed":
                        m_stat["completed_2ply_kg"] += w2
                        m_stat["completed_3ply_kg"] += w3
                        m_stat["completed_total_kg"] += tot_w
                        m_stat["completed_springs_2ply"] += s2
                        m_stat["completed_springs_3ply"] += s3
                        m_stat["completed_batches"] += 1
                        if t_master == "user1":
                            m_stat["dm1_completed_kg"] += tot_w
                        else:
                            m_stat["dm2_completed_kg"] += tot_w
                    elif status == "rejected":
                        m_stat["rejected_2ply_kg"] += w2
                        m_stat["rejected_3ply_kg"] += w3
                        m_stat["rejected_total_kg"] += tot_w
                        m_stat["rejected_springs_2ply"] += s2
                        m_stat["rejected_springs_3ply"] += s3
                        m_stat["rejected_batches"] += 1
                        if t_master == "user1":
                            m_stat["dm1_rejected_kg"] += tot_w
                        else:
                            m_stat["dm2_rejected_kg"] += tot_w
                    else:
                        m_stat["pending_total_kg"] += tot_w
                        m_stat["pending_batches"] += 1

            # 2. Automatic Tasks
            auto_tasks = dt.get("automatic_tasks") or []
            if isinstance(auto_tasks, list):
                for t in auto_tasks:
                    if not isinstance(t, dict):
                        continue
                    t_master = "user2" if t.get("assigned_to") == "user2" else "user1"
                    if master and master != "all" and t_master != master:
                        continue
                        
                    m_id = str(t.get("machine", "") or "").lower()
                    mc = machine_capacities.get(m_id, {'capacity': 12.0, 'total_springs': 8})
                    capacity = safe_float(t.get("weight"), mc['capacity'])
                    tot_springs = safe_int(mc['total_springs'], 8)
                    kg_per_spring = capacity / tot_springs if tot_springs > 0 else 1.5
                    
                    s2 = safe_int(t.get("springs_2ply", 0))
                    s3 = safe_int(t.get("springs_3ply", 0))
                    
                    pw2 = safe_float(t.get("ply2_weight", 0))
                    w2 = pw2 if pw2 > 0 else (s2 * kg_per_spring)
                    
                    pw3 = safe_float(t.get("ply3_weight", 0))
                    w3 = pw3 if pw3 > 0 else (s3 * kg_per_spring)
                    
                    tot_w = (w2 + w3) if (w2 + w3) > 0 else capacity
                    status = str(t.get("status", "pending") or "pending").strip().lower()
                    
                    if status == "completed":
                        m_stat["completed_2ply_kg"] += w2
                        m_stat["completed_3ply_kg"] += w3
                        m_stat["completed_total_kg"] += tot_w
                        m_stat["completed_springs_2ply"] += s2
                        m_stat["completed_springs_3ply"] += s3
                        m_stat["completed_batches"] += 1
                        if t_master == "user1":
                            m_stat["dm1_completed_kg"] += tot_w
                        else:
                            m_stat["dm2_completed_kg"] += tot_w
                    elif status == "rejected":
                        m_stat["rejected_2ply_kg"] += w2
                        m_stat["rejected_3ply_kg"] += w3
                        m_stat["rejected_total_kg"] += tot_w
                        m_stat["rejected_springs_2ply"] += s2
                        m_stat["rejected_springs_3ply"] += s3
                        m_stat["rejected_batches"] += 1
                        if t_master == "user1":
                            m_stat["dm1_rejected_kg"] += tot_w
                        else:
                            m_stat["dm2_rejected_kg"] += tot_w
                    else:
                        m_stat["pending_total_kg"] += tot_w
                        m_stat["pending_batches"] += 1

        # Format and sort months
        months_list = []
        for m_key, m_val in months_dict.items():
            tot_processed = m_val["completed_total_kg"] + m_val["rejected_total_kg"]
            rej_pct = (m_val["rejected_total_kg"] / tot_processed * 100) if tot_processed > 0 else 0.0
            
            m_val["completed_2ply_kg"] = round(m_val["completed_2ply_kg"], 2)
            m_val["completed_3ply_kg"] = round(m_val["completed_3ply_kg"], 2)
            m_val["completed_total_kg"] = round(m_val["completed_total_kg"], 2)
            m_val["rejected_2ply_kg"] = round(m_val["rejected_2ply_kg"], 2)
            m_val["rejected_3ply_kg"] = round(m_val["rejected_3ply_kg"], 2)
            m_val["rejected_total_kg"] = round(m_val["rejected_total_kg"], 2)
            m_val["pending_total_kg"] = round(m_val["pending_total_kg"], 2)
            m_val["total_processed_kg"] = round(tot_processed, 2)
            m_val["rejection_rate_percent"] = round(rej_pct, 2)
            m_val["dm1_completed_kg"] = round(m_val["dm1_completed_kg"], 2)
            m_val["dm2_completed_kg"] = round(m_val["dm2_completed_kg"], 2)
            m_val["dm1_rejected_kg"] = round(m_val["dm1_rejected_kg"], 2)
            m_val["dm2_rejected_kg"] = round(m_val["dm2_rejected_kg"], 2)
            
            months_list.append(m_val)
            
        months_list.sort(key=lambda x: x["month_key"], reverse=True)
        
        # Grand Totals
        grand_completed_2ply_kg = sum(m["completed_2ply_kg"] for m in months_list)
        grand_completed_3ply_kg = sum(m["completed_3ply_kg"] for m in months_list)
        grand_completed_total_kg = sum(m["completed_total_kg"] for m in months_list)
        grand_rejected_2ply_kg = sum(m["rejected_2ply_kg"] for m in months_list)
        grand_rejected_3ply_kg = sum(m["rejected_3ply_kg"] for m in months_list)
        grand_rejected_total_kg = sum(m["rejected_total_kg"] for m in months_list)
        grand_completed_batches = sum(m["completed_batches"] for m in months_list)
        grand_rejected_batches = sum(m["rejected_batches"] for m in months_list)
        grand_total_processed_kg = grand_completed_total_kg + grand_rejected_total_kg
        grand_rejection_rate = (grand_rejected_total_kg / grand_total_processed_kg * 100) if grand_total_processed_kg > 0 else 0.0
        
        sorted_years = sorted(list(available_years), reverse=True)
        if not sorted_years:
            sorted_years = [datetime.utcnow().strftime("%Y")]
            
        return {
            "selected_year": year or "all",
            "available_years": sorted_years,
            "selected_master": master or "all",
            "grand_summary": {
                "total_completed_kg": round(grand_completed_total_kg, 2),
                "total_completed_2ply_kg": round(grand_completed_2ply_kg, 2),
                "total_completed_3ply_kg": round(grand_completed_3ply_kg, 2),
                "total_rejected_kg": round(grand_rejected_total_kg, 2),
                "total_rejected_2ply_kg": round(grand_rejected_2ply_kg, 2),
                "total_rejected_3ply_kg": round(grand_rejected_3ply_kg, 2),
                "total_processed_kg": round(grand_total_processed_kg, 2),
                "total_completed_batches": grand_completed_batches,
                "total_rejected_batches": grand_rejected_batches,
                "rejection_rate_percent": round(grand_rejection_rate, 2),
                "total_months": len(months_list)
            },
            "months": months_list
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ----------------------------------------------------
# Stock In Hand Endpoints (Ascending Shade, 2P & 3P, Manual Entry & Modify Pending)
# ----------------------------------------------------
@api_router.get("/stock-in-hand")
async def get_stock_in_hand(
    as_of_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
):
    """
    Get consolidated Stock in Hand without master-wise division.
    Sorted in ascending order of shade number.
    Returns 2-PLY, 3-PLY, Total in Hand (kg + springs), manual additions,
    and pending tasks with change/edit capability while not completed.
    """
    try:
        machine_capacities = {
            'm1': {'capacity': 10.5, 'total_springs': 7},
            'm2': {'capacity': 12.0, 'total_springs': 8},
            'm3': {'capacity': 12.0, 'total_springs': 8},
            'm4': {'capacity': 6.0, 'total_springs': 4},
            'm5': {'capacity': 24.0, 'total_springs': 16},
            'm6': {'capacity': 15.0, 'total_springs': 10},
            'm7': {'capacity': 15.0, 'total_springs': 10},
            'm8': {'capacity': 12.0, 'total_springs': 8},
            'm9': {'capacity': 12.0, 'total_springs': 8},
            'm10': {'capacity': 6.0, 'total_springs': 4},
            'm11': {'capacity': 6.0, 'total_springs': 4},
        }
        
        # 1. Fetch all shade definitions from db.shades
        shades_cursor = db.shades.find({})
        all_shades = await shades_cursor.to_list(10000)
        
        shades_data = {}
        for s in all_shades:
            sn_raw = str(s.get("shade_number", "")).strip().lstrip("#")
            if not sn_raw:
                continue
            shades_data[sn_raw.lower()] = {
                "shade_number": sn_raw,
                "shade_id": str(s.get("_id", "")),
                "program_number": s.get("program_number", "P1"),
                "rc": s.get("rc", "No"),
                "completed_2ply_kg": 0.0,
                "completed_3ply_kg": 0.0,
                "completed_total_kg": 0.0,
                "completed_springs_2ply": 0,
                "completed_springs_3ply": 0,
                "completed_batches": 0,
                "manual_2ply_kg": 0.0,
                "manual_3ply_kg": 0.0,
                "manual_total_kg": 0.0,
                "manual_entries": [],
                "pending_2ply_kg": 0.0,
                "pending_3ply_kg": 0.0,
                "pending_total_kg": 0.0,
                "pending_springs_2ply": 0,
                "pending_springs_3ply": 0,
                "pending_batches": 0,
                "pending_tasks": [],
                "last_batch_date": None,
            }
            
        # 2. Fetch all daily tasks
        daily_tasks_cursor = db.daily_tasks.find({})
        daily_tasks = await daily_tasks_cursor.to_list(10000)
        
        machines = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']
        
        for dt in daily_tasks:
            dt_date = dt.get("date", "")
            if as_of_date and dt_date > as_of_date:
                continue
            if from_date and dt_date < from_date:
                continue
            if to_date and dt_date > to_date:
                continue
                
            # Manual Machine Tasks
            for m_id in machines:
                tasks = dt.get(m_id) or []
                if not isinstance(tasks, list):
                    continue
                mc = machine_capacities.get(m_id, {'capacity': 12.0, 'total_springs': 8})
                
                for t in tasks:
                    if not isinstance(t, dict):
                        continue
                    sn_raw = str(t.get('shade_number', '') or '').strip().lstrip("#")
                    if not sn_raw:
                        continue
                    sn_key = sn_raw.lower()
                    if sn_key not in shades_data:
                        shades_data[sn_key] = {
                            "shade_number": sn_raw,
                            "shade_id": None,
                            "program_number": "P1",
                            "rc": "No",
                            "completed_2ply_kg": 0.0,
                            "completed_3ply_kg": 0.0,
                            "completed_total_kg": 0.0,
                            "completed_springs_2ply": 0,
                            "completed_springs_3ply": 0,
                            "completed_batches": 0,
                            "manual_2ply_kg": 0.0,
                            "manual_3ply_kg": 0.0,
                            "manual_total_kg": 0.0,
                            "manual_entries": [],
                            "pending_2ply_kg": 0.0,
                            "pending_3ply_kg": 0.0,
                            "pending_total_kg": 0.0,
                            "pending_springs_2ply": 0,
                            "pending_springs_3ply": 0,
                            "pending_batches": 0,
                            "pending_tasks": [],
                            "last_batch_date": None,
                        }
                    
                    capacity = safe_float(mc.get('capacity'), 12.0)
                    tot_springs = safe_int(mc.get('total_springs'), 8)
                    kg_per_spring = capacity / tot_springs if tot_springs > 0 else 1.5
                    
                    s2 = safe_int(t.get("springs_2ply", 0))
                    s3 = safe_int(t.get("springs_3ply", 0))
                    
                    pw2 = safe_float(t.get("ply2_weight", 0))
                    w2 = pw2 if pw2 > 0 else (s2 * kg_per_spring)
                    
                    pw3 = safe_float(t.get("ply3_weight", 0))
                    w3 = pw3 if pw3 > 0 else (s3 * kg_per_spring)
                    
                    tot_w = (w2 + w3) if (w2 + w3) > 0 else safe_float(t.get("weight"), capacity)
                    status = str(t.get("status", "pending") or "pending").strip().lower()
                    
                    if status == "completed":
                        shades_data[sn_key]["completed_2ply_kg"] += w2
                        shades_data[sn_key]["completed_3ply_kg"] += w3
                        shades_data[sn_key]["completed_total_kg"] += tot_w
                        shades_data[sn_key]["completed_springs_2ply"] += s2
                        shades_data[sn_key]["completed_springs_3ply"] += s3
                        shades_data[sn_key]["completed_batches"] += 1
                        curr_last = shades_data[sn_key]["last_batch_date"]
                        if not curr_last or dt_date > curr_last:
                            shades_data[sn_key]["last_batch_date"] = dt_date
                    elif status in ["pending", "in-progress"]:
                        shades_data[sn_key]["pending_2ply_kg"] += w2
                        shades_data[sn_key]["pending_3ply_kg"] += w3
                        shades_data[sn_key]["pending_total_kg"] += tot_w
                        shades_data[sn_key]["pending_springs_2ply"] += s2
                        shades_data[sn_key]["pending_springs_3ply"] += s3
                        shades_data[sn_key]["pending_batches"] += 1
                        shades_data[sn_key]["pending_tasks"].append({
                            "task_id": str(t.get("id", "") or ""),
                            "daily_task_id": str(dt.get("_id", "")),
                            "date": dt_date,
                            "machine": m_id.upper(),
                            "machine_id": m_id,
                            "shade_number": sn_raw,
                            "springs_2ply": s2,
                            "springs_3ply": s3,
                            "weight": round(tot_w, 2),
                            "ply2_weight": round(w2, 2),
                            "ply3_weight": round(w3, 2),
                            "status": status,
                            "assigned_to": str(t.get("assigned_to", "user1") or "user1"),
                            "can_modify": True
                        })
                        
            # Automatic Tasks
            auto_tasks = dt.get("automatic_tasks") or []
            if isinstance(auto_tasks, list):
                for t in auto_tasks:
                    if not isinstance(t, dict):
                        continue
                    sn_raw = str(t.get('shade_number', '') or '').strip().lstrip("#")
                    if not sn_raw:
                        continue
                    sn_key = sn_raw.lower()
                    if sn_key not in shades_data:
                        shades_data[sn_key] = {
                            "shade_number": sn_raw,
                            "shade_id": None,
                            "program_number": "P1",
                            "rc": "No",
                            "completed_2ply_kg": 0.0,
                            "completed_3ply_kg": 0.0,
                            "completed_total_kg": 0.0,
                            "completed_springs_2ply": 0,
                            "completed_springs_3ply": 0,
                            "completed_batches": 0,
                            "manual_2ply_kg": 0.0,
                            "manual_3ply_kg": 0.0,
                            "manual_total_kg": 0.0,
                            "manual_entries": [],
                            "pending_2ply_kg": 0.0,
                            "pending_3ply_kg": 0.0,
                            "pending_total_kg": 0.0,
                            "pending_springs_2ply": 0,
                            "pending_springs_3ply": 0,
                            "pending_batches": 0,
                            "pending_tasks": [],
                            "last_batch_date": None,
                        }
                        
                    m_label = str(t.get("machine", "") or "").lower()
                    mc = machine_capacities.get(m_label, {'capacity': 12.0, 'total_springs': 8})
                    capacity = safe_float(mc.get('capacity'), 12.0)
                    tot_springs = safe_int(mc.get('total_springs'), 8)
                    kg_per_spring = capacity / tot_springs if tot_springs > 0 else 1.5
                    
                    s2 = safe_int(t.get("springs_2ply", 0))
                    s3 = safe_int(t.get("springs_3ply", 0))
                    
                    pw2 = safe_float(t.get("ply2_weight", 0))
                    w2 = pw2 if pw2 > 0 else (s2 * kg_per_spring)
                    
                    pw3 = safe_float(t.get("ply3_weight", 0))
                    w3 = pw3 if pw3 > 0 else (s3 * kg_per_spring)
                    
                    tot_w = (w2 + w3) if (w2 + w3) > 0 else capacity
                    status = str(t.get("status", "pending") or "pending").strip().lower()
                    
                    if status == "completed":
                        shades_data[sn_key]["completed_2ply_kg"] += w2
                        shades_data[sn_key]["completed_3ply_kg"] += w3
                        shades_data[sn_key]["completed_total_kg"] += tot_w
                        shades_data[sn_key]["completed_springs_2ply"] += s2
                        shades_data[sn_key]["completed_springs_3ply"] += s3
                        shades_data[sn_key]["completed_batches"] += 1
                        curr_last = shades_data[sn_key]["last_batch_date"]
                        if not curr_last or dt_date > curr_last:
                            shades_data[sn_key]["last_batch_date"] = dt_date
                    elif status in ["pending", "in-progress"]:
                        shades_data[sn_key]["pending_2ply_kg"] += w2
                        shades_data[sn_key]["pending_3ply_kg"] += w3
                        shades_data[sn_key]["pending_total_kg"] += tot_w
                        shades_data[sn_key]["pending_springs_2ply"] += s2
                        shades_data[sn_key]["pending_springs_3ply"] += s3
                        shades_data[sn_key]["pending_batches"] += 1
                        shades_data[sn_key]["pending_tasks"].append({
                            "task_id": str(t.get("id", "") or ""),
                            "daily_task_id": str(dt.get("_id", "")),
                            "date": dt_date,
                            "machine": str(t.get("machine", "AUTO")).upper(),
                            "machine_id": "automatic_tasks",
                            "shade_number": sn_raw,
                            "springs_2ply": s2,
                            "springs_3ply": s3,
                            "weight": round(tot_w, 2),
                            "ply2_weight": round(w2, 2),
                            "ply3_weight": round(w3, 2),
                            "status": status,
                            "assigned_to": str(t.get("assigned_to", "user1") or "user1"),
                            "can_modify": True
                        })

        # 3. Fetch manual entries from db.stock_entries
        stock_entries_cursor = db.stock_entries.find({})
        stock_entries = await stock_entries_cursor.to_list(10000)
        
        for entry in stock_entries:
            if not isinstance(entry, dict):
                continue
            entry_date = str(entry.get("date", "") or "").strip()
            if as_of_date and entry_date > as_of_date:
                continue
            if from_date and entry_date < from_date:
                continue
            if to_date and entry_date > to_date:
                continue
                
            sn_raw = str(entry.get("shade_number", "") or "").strip().lstrip("#")
            if not sn_raw:
                continue
            sn_key = sn_raw.lower()
            if sn_key not in shades_data:
                shades_data[sn_key] = {
                    "shade_number": sn_raw,
                    "shade_id": None,
                    "program_number": "P1",
                    "rc": "No",
                    "completed_2ply_kg": 0.0,
                    "completed_3ply_kg": 0.0,
                    "completed_total_kg": 0.0,
                    "completed_springs_2ply": 0,
                    "completed_springs_3ply": 0,
                    "completed_batches": 0,
                    "manual_2ply_kg": 0.0,
                    "manual_3ply_kg": 0.0,
                    "manual_total_kg": 0.0,
                    "manual_entries": [],
                    "pending_2ply_kg": 0.0,
                    "pending_3ply_kg": 0.0,
                    "pending_total_kg": 0.0,
                    "pending_springs_2ply": 0,
                    "pending_springs_3ply": 0,
                    "pending_batches": 0,
                    "pending_tasks": [],
                    "last_batch_date": None,
                }
                
            p2 = safe_float(entry.get("ply2_kg", 0))
            p3 = safe_float(entry.get("ply3_kg", 0))
            shades_data[sn_key]["manual_2ply_kg"] += p2
            shades_data[sn_key]["manual_3ply_kg"] += p3
            shades_data[sn_key]["manual_total_kg"] += (p2 + p3)
            shades_data[sn_key]["manual_entries"].append({
                "id": str(entry.get("_id", "")),
                "date": entry_date,
                "ply2_kg": round(p2, 2),
                "ply3_kg": round(p3, 2),
                "total_kg": round(p2 + p3, 2),
                "notes": str(entry.get("notes", "Manual entry") or ""),
                "created_at": str(entry.get("created_at", "") or "")
            })
            
        # 3.5. Fetch spring overrides/adjustments from db.shade_spring_stocks
        spring_stocks_cursor = db.shade_spring_stocks.find({})
        spring_stocks = await spring_stocks_cursor.to_list(10000)
        spring_overrides = {}
        for s_doc in spring_stocks:
            if isinstance(s_doc, dict):
                s_key = str(s_doc.get("shade_number", "") or "").strip().lower().lstrip("#")
                if s_key:
                    spring_overrides[s_key] = {
                        "springs_2ply": safe_int(s_doc.get("springs_2ply")),
                        "springs_3ply": safe_int(s_doc.get("springs_3ply")),
                    }
                    if s_key not in shades_data:
                        shades_data[s_key] = {
                            "shade_number": str(s_doc.get("shade_number", "") or "").strip().lstrip("#"),
                            "shade_id": None,
                            "program_number": "P1",
                            "rc": "No",
                            "completed_2ply_kg": 0.0,
                            "completed_3ply_kg": 0.0,
                            "completed_total_kg": 0.0,
                            "completed_springs_2ply": 0,
                            "completed_springs_3ply": 0,
                            "completed_batches": 0,
                            "manual_2ply_kg": 0.0,
                            "manual_3ply_kg": 0.0,
                            "manual_total_kg": 0.0,
                            "manual_entries": [],
                            "pending_2ply_kg": 0.0,
                            "pending_3ply_kg": 0.0,
                            "pending_total_kg": 0.0,
                            "pending_springs_2ply": 0,
                            "pending_springs_3ply": 0,
                            "pending_batches": 0,
                            "pending_tasks": [],
                            "last_batch_date": None,
                        }
            
        # 4. Consolidate and round current stocks
        items_list = []
        for sn_key, data in shades_data.items():
            data["completed_2ply_kg"] = round(data["completed_2ply_kg"], 2)
            data["completed_3ply_kg"] = round(data["completed_3ply_kg"], 2)
            data["completed_total_kg"] = round(data["completed_total_kg"], 2)
            data["manual_2ply_kg"] = round(data["manual_2ply_kg"], 2)
            data["manual_3ply_kg"] = round(data["manual_3ply_kg"], 2)
            data["manual_total_kg"] = round(data["manual_total_kg"], 2)
            
            # Current stock in hand = completed production + manual stock adjustments
            stock_2p = round(data["completed_2ply_kg"] + data["manual_2ply_kg"], 2)
            stock_3p = round(data["completed_3ply_kg"] + data["manual_3ply_kg"], 2)
            stock_tot = round(stock_2p + stock_3p, 2)
            
            data["current_stock_2ply_kg"] = stock_2p
            data["current_stock_3ply_kg"] = stock_3p
            data["current_stock_total_kg"] = stock_tot
            
            # SPRINGS LOGIC (Primary metric requested by client)
            if sn_key in spring_overrides:
                data["springs_2ply"] = max(0, spring_overrides[sn_key]["springs_2ply"])
                data["springs_3ply"] = max(0, spring_overrides[sn_key]["springs_3ply"])
                data["is_spring_custom"] = True
            else:
                data["springs_2ply"] = max(0, data["completed_springs_2ply"])
                data["springs_3ply"] = max(0, data["completed_springs_3ply"])
                data["is_spring_custom"] = False
                
            data["total_springs"] = data["springs_2ply"] + data["springs_3ply"]
            
            # 3-digit padded number e.g. 001, 002, 120 (Matches physical factory list format)
            sn_clean = data["shade_number"].strip()
            if sn_clean.isdigit():
                data["display_number"] = sn_clean.zfill(3)
            else:
                data["display_number"] = sn_clean
            
            data["pending_2ply_kg"] = round(data["pending_2ply_kg"], 2)
            data["pending_3ply_kg"] = round(data["pending_3ply_kg"], 2)
            data["pending_total_kg"] = round(data["pending_total_kg"], 2)
            
            # Sort pending tasks descending by date
            data["pending_tasks"].sort(key=lambda x: str(x.get("date", "")), reverse=True)
            # Sort manual entries descending by date
            data["manual_entries"].sort(key=lambda x: str(x.get("date", "")), reverse=True)
            
            items_list.append(data)
            
        # 5. Natural Ascending Sorting by Shade Number
        def natural_shade_sort(item):
            sn = str(item.get("shade_number", "")).strip()
            parts = re.split(r'(\d+)', sn)
            res = []
            for p in parts:
                if p.isdigit():
                    res.append(int(p))
                else:
                    res.append(p.lower())
            return res
            
        items_list.sort(key=natural_shade_sort)
        
        # 6. Apply search filter if provided
        if search and search.strip():
            q = search.strip().lower().lstrip("#")
            items_list = [i for i in items_list if q in i["shade_number"].lower() or q in i.get("display_number", "").lower()]
            
        # 7. Grand Totals (Focusing on Springs count as primary)
        grand_total_springs = sum(i["total_springs"] for i in items_list)
        grand_springs_2ply = sum(i["springs_2ply"] for i in items_list)
        grand_springs_3ply = sum(i["springs_3ply"] for i in items_list)
        in_stock_shades_count = len([i for i in items_list if i["total_springs"] > 0])
        grand_pending_batches = sum(i["pending_batches"] for i in items_list)
        
        return {
            "filters": {
                "as_of_date": as_of_date,
                "from_date": from_date,
                "to_date": to_date,
                "search": search
            },
            "summary": {
                "total_springs": grand_total_springs,
                "total_springs_2ply": grand_springs_2ply,
                "total_springs_3ply": grand_springs_3ply,
                "total_stock_kg": round(sum(i["current_stock_total_kg"] for i in items_list), 2),
                "total_2ply_kg": round(sum(i["current_stock_2ply_kg"] for i in items_list), 2),
                "total_3ply_kg": round(sum(i["current_stock_3ply_kg"] for i in items_list), 2),
                "total_pending_batches": grand_pending_batches,
                "total_shades_count": len(items_list),
                "in_stock_shades_count": in_stock_shades_count,
            },
            "shades": items_list
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/stock-in-hand/adjust-springs")
async def adjust_springs(req: AdjustSpringsRequest):
    """
    Direct 1-click or keyboard adjustment of spring quantity for a shade.
    Supports +1 / -1 increment, direct typing value, or setting specific springs.
    """
    try:
        clean_sn = str(req.shade_number).strip().lstrip("#")
        sn_key = clean_sn.lower()
        
        existing = await db.shade_spring_stocks.find_one({"shade_number": clean_sn})
        if not existing:
            existing = await db.shade_spring_stocks.find_one({"shade_number": sn_key})
            
        cur_2p = safe_int(existing.get("springs_2ply", 0)) if existing else 0
        cur_3p = safe_int(existing.get("springs_3ply", 0)) if existing else 0
        
        if req.action == "increment":
            step = abs(safe_int(req.delta, 1))
            if req.ply_type == "2ply":
                cur_2p += step
            elif req.ply_type == "3ply":
                cur_3p += step
            elif req.ply_type == "both":
                cur_2p += step
                cur_3p += step
        elif req.action == "decrement":
            step = abs(safe_int(req.delta, 1))
            if req.ply_type == "2ply":
                cur_2p = max(0, cur_2p - step)
            elif req.ply_type == "3ply":
                cur_3p = max(0, cur_3p - step)
            elif req.ply_type == "both":
                cur_2p = max(0, cur_2p - step)
                cur_3p = max(0, cur_3p - step)
        elif req.action == "set":
            val = max(0, safe_int(req.value, 0))
            if req.ply_type == "2ply":
                cur_2p = val
            elif req.ply_type == "3ply":
                cur_3p = val
                
        if req.springs_2ply is not None:
            cur_2p = max(0, safe_int(req.springs_2ply))
        if req.springs_3ply is not None:
            cur_3p = max(0, safe_int(req.springs_3ply))
            
        await db.shade_spring_stocks.update_one(
            {"shade_number": clean_sn},
            {"$set": {
                "shade_number": clean_sn,
                "springs_2ply": cur_2p,
                "springs_3ply": cur_3p,
                "updated_at": datetime.utcnow()
            }},
            upsert=True
        )
        
        return {
            "success": True,
            "shade_number": clean_sn,
            "springs_2ply": cur_2p,
            "springs_3ply": cur_3p,
            "total_springs": cur_2p + cur_3p,
            "message": f"Updated springs for Shade #{clean_sn}"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.put("/stock-in-hand/modify-pending-task")
async def modify_pending_task(req: ModifyPendingTaskRequest):
    """
    Modify an ongoing task lot (change shade, springs 2P/3P, weight)
    Strict Rule: Only allowed while task status is NOT 'completed'.
    """
    try:
        daily_task = await db.daily_tasks.find_one({"_id": ObjectId(req.daily_task_id)})
        if not daily_task:
            raise HTTPException(status_code=404, detail="Daily task record not found")
            
        machine_key = req.machine_id.lower()
        machine_tasks = daily_task.get(machine_key, [])
        task_index = -1
        for i, t in enumerate(machine_tasks):
            if str(t.get("id")) == str(req.lot_id):
                task_index = i
                break
                
        if task_index == -1:
            try:
                idx = int(req.lot_id)
                if 0 <= idx < len(machine_tasks):
                    task_index = idx
            except ValueError:
                pass
                
        if task_index == -1:
            raise HTTPException(status_code=404, detail="Machine task lot not found")
            
        target_lot = machine_tasks[task_index]
        current_status = str(target_lot.get("status", "pending")).lower()
        if current_status == "completed":
            raise HTTPException(
                status_code=400, 
                detail="Task has already been completed and confirmed. Change option is only available while task is pending or in-progress."
            )
            
        if req.shade_number is not None:
            clean_sn = str(req.shade_number).strip().lstrip("#")
            target_lot["shade_number"] = clean_sn
            target_lot["is_modified"] = True
            
        if req.springs_2ply is not None:
            target_lot["springs_2ply"] = req.springs_2ply
            
        if req.springs_3ply is not None:
            target_lot["springs_3ply"] = req.springs_3ply
            
        if req.ply2_weight is not None:
            target_lot["ply2_weight"] = req.ply2_weight
            
        if req.ply3_weight is not None:
            target_lot["ply3_weight"] = req.ply3_weight
            
        if req.weight is not None:
            target_lot["weight"] = req.weight
            
        await db.daily_tasks.update_one(
            {"_id": ObjectId(req.daily_task_id)},
            {"$set": {machine_key: machine_tasks}}
        )
        
        return {"message": "Pending task updated successfully", "task": target_lot}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/stock-in-hand/manual")
async def add_manual_stock(entry: ManualStockCreate):
    """Add a manual stock entry/adjustment for a shade"""
    try:
        clean_sn = str(entry.shade_number).strip().lstrip("#")
        today_str = entry.date or datetime.utcnow().strftime("%Y-%m-%d")
        doc = {
            "shade_number": clean_sn,
            "ply2_kg": float(entry.ply2_kg or 0),
            "ply3_kg": float(entry.ply3_kg or 0),
            "date": today_str,
            "notes": entry.notes or "Manual entry",
            "created_at": datetime.utcnow()
        }
        res = await db.stock_entries.insert_one(doc)
        created = await db.stock_entries.find_one({"_id": res.inserted_id})
        return {
            "id": str(created["_id"]),
            "shade_number": created["shade_number"],
            "ply2_kg": created["ply2_kg"],
            "ply3_kg": created["ply3_kg"],
            "date": created["date"],
            "notes": created["notes"],
            "message": "Manual stock entry added successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.put("/stock-in-hand/manual/{entry_id}")
async def update_manual_stock(entry_id: str, entry: ManualStockUpdate):
    """Update a manual stock entry"""
    try:
        update_data = {}
        if entry.shade_number is not None:
            update_data["shade_number"] = str(entry.shade_number).strip().lstrip("#")
        if entry.ply2_kg is not None:
            update_data["ply2_kg"] = float(entry.ply2_kg)
        if entry.ply3_kg is not None:
            update_data["ply3_kg"] = float(entry.ply3_kg)
        if entry.date is not None:
            update_data["date"] = entry.date
        if entry.notes is not None:
            update_data["notes"] = entry.notes
            
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields provided for update")
            
        res = await db.stock_entries.update_one(
            {"_id": ObjectId(entry_id)},
            {"$set": update_data}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Manual stock entry not found")
            
        return {"message": "Manual stock entry updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.delete("/stock-in-hand/manual/{entry_id}")
async def delete_manual_stock(entry_id: str):
    """Delete a manual stock entry"""
    try:
        res = await db.stock_entries.delete_one({"_id": ObjectId(entry_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Manual stock entry not found")
        return {"message": "Manual stock entry deleted successfully"}
    except HTTPException:
        raise
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
