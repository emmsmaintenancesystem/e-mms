import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  DoorOpen,
  Edit3,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Tag,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  adminCreateBuilding,
  adminCreateCategory,
  adminCreateFloor,
  adminCreateReporterType,
  adminCreateRoom,
  adminCreateSubcategory,
  adminCreateTechnician,
  adminCreateUser,
  adminListBuildings,
  adminListCategories,
  adminListFloors,
  adminListReporterTypes,
  adminListRooms,
  adminListSubcategories,
  adminListTechnicians,
  adminListUsers,
  adminResetUserPassword,
  adminUpdateBuilding,
  adminUpdateCategory,
  adminUpdateFloor,
  adminUpdateReporterType,
  adminUpdateRoom,
  adminUpdateSubcategory,
  adminUpdateTechnician,
  adminUpdateUser,
} from '../lib/apiClient';
import {
  Building,
  Category,
  Floor,
  ROLE_LABELS,
  ReporterType,
  Room,
  StaffRole,
  Subcategory,
  Technician,
  User,
  formatThaiDateTime,
} from '../types/api';

type AdminTab =
  | 'buildings'
  | 'floors'
  | 'rooms'
  | 'categories'
  | 'subcategories'
  | 'reporter_types'
  | 'technicians'
  | 'users';

export const StaffAdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('buildings');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Master Data Lists
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [reporterTypes, setReporterTypes] = useState<ReporterType[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Filters for Floors, Rooms & Subcategories tab
  const [filterBuildingId, setFilterBuildingId] = useState<number>(0);
  const [filterFloorId, setFilterFloorId] = useState<number>(0);
  const [filterCategoryId, setFilterCategoryId] = useState<number>(0);

  // Edit / Create Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Generic Form Fields
  const [fCode, setFCode] = useState<string>('');
  const [fName, setFName] = useState<string>('');
  const [fDescription, setFDescription] = useState<string>('');
  const [fBuildingId, setFBuildingId] = useState<number>(0);
  const [fFloorId, setFFloorId] = useState<number>(0);
  const [fCategoryId, setFCategoryId] = useState<number>(0);
  const [fSortOrder, setFSortOrder] = useState<number>(10);
  const [fIsActive, setFIsActive] = useState<boolean>(true);

  // Technician Fields
  const [fNickname, setFNickname] = useState<string>('');
  const [fSpecialty, setFSpecialty] = useState<string>('');
  const [fPhone, setFPhone] = useState<string>('');

  // User Fields
  const [fUsername, setFUsername] = useState<string>('');
  const [fPassword, setFPassword] = useState<string>('');
  const [fDisplayName, setFDisplayName] = useState<string>('');
  const [fRole, setFRole] = useState<StaffRole>('technician');

  // Password Reset Modal State
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [newResetPassword, setNewResetPassword] = useState<string>('');
  const [isResettingPwd, setIsResettingPwd] = useState<boolean>(false);

  const loadAllAdminData = async () => {
    setIsLoading(true);
    try {
      const [bList, flList, rList, cList, scList, rtList, tList, uList] =
        await Promise.all([
          adminListBuildings(),
          adminListFloors(),
          adminListRooms(),
          adminListCategories(),
          adminListSubcategories(),
          adminListReporterTypes(),
          adminListTechnicians(),
          adminListUsers(),
        ]);
      setBuildings(bList);
      setFloors(flList);
      setRooms(rList);
      setCategories(cList);
      setSubcategories(scList);
      setReporterTypes(rtList);
      setTechnicians(tList);
      setUsers(uList);
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถโหลดข้อมูลตั้งค่าระบบได้',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFCode('');
    setFName('');
    setFDescription('');
    setFBuildingId(buildings[0]?.id || 0);
    setFFloorId(floors[0]?.id || 0);
    setFCategoryId(categories[0]?.id || 0);
    setFSortOrder(10);
    setFIsActive(true);
    setFNickname('');
    setFSpecialty('');
    setFPhone('');
    setFUsername('');
    setFPassword('');
    setFDisplayName('');
    setFRole('technician');
  };

  const handleTabSwitch = (tab: AdminTab) => {
    setActiveTab(tab);
    setFeedback(null);
    resetForm();
  };

  // Cascading floors for Room form
  const formAvailableFloors = useMemo(() => {
    if (fBuildingId <= 0) return floors;
    return floors.filter((fl) => fl.building_id === fBuildingId);
  }, [floors, fBuildingId]);

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsSaving(true);

    try {
      if (activeTab === 'buildings') {
        if (editingId) {
          await adminUpdateBuilding(editingId, {
            code: fCode.trim(),
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        } else {
          await adminCreateBuilding({
            code: fCode.trim(),
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        }
      } else if (activeTab === 'floors') {
        if (editingId) {
          await adminUpdateFloor(editingId, {
            building_id: fBuildingId,
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        } else {
          await adminCreateFloor({
            building_id: fBuildingId,
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        }
      } else if (activeTab === 'rooms') {
        if (editingId) {
          await adminUpdateRoom(editingId, {
            floor_id: fFloorId,
            code: fCode.trim(),
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        } else {
          await adminCreateRoom({
            floor_id: fFloorId,
            code: fCode.trim(),
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        }
      } else if (activeTab === 'categories') {
        if (editingId) {
          await adminUpdateCategory(editingId, {
            code: fCode.trim(),
            name: fName.trim(),
            description: fDescription.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        } else {
          await adminCreateCategory({
            code: fCode.trim(),
            name: fName.trim(),
            description: fDescription.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        }
      } else if (activeTab === 'subcategories') {
        if (editingId) {
          await adminUpdateSubcategory(editingId, {
            category_id: fCategoryId,
            code: fCode.trim(),
            name: fName.trim(),
            description: fDescription.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        } else {
          await adminCreateSubcategory({
            category_id: fCategoryId,
            code: fCode.trim(),
            name: fName.trim(),
            description: fDescription.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        }
      } else if (activeTab === 'reporter_types') {
        if (editingId) {
          await adminUpdateReporterType(editingId, {
            code: fCode.trim(),
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        } else {
          await adminCreateReporterType({
            code: fCode.trim(),
            name: fName.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        }
      } else if (activeTab === 'technicians') {
        if (editingId) {
          await adminUpdateTechnician(editingId, {
            full_name: fName.trim(),
            nickname: fNickname.trim(),
            specialty: fSpecialty.trim(),
            phone: fPhone.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        } else {
          await adminCreateTechnician({
            full_name: fName.trim(),
            nickname: fNickname.trim(),
            specialty: fSpecialty.trim(),
            phone: fPhone.trim(),
            sort_order: fSortOrder,
            is_active: fIsActive,
          });
        }
      } else if (activeTab === 'users') {
        if (editingId) {
          await adminUpdateUser(editingId, {
            username: fUsername.trim(),
            display_name: fDisplayName.trim(),
            role: fRole,
            is_active: fIsActive,
          });
        } else {
          await adminCreateUser({
            username: fUsername.trim(),
            password: fPassword,
            display_name: fDisplayName.trim(),
            role: fRole,
            is_active: fIsActive,
          });
        }
      }

      setFeedback({
        type: 'success',
        message: editingId
          ? 'บันทึกการแก้ไขข้อมูลเรียบร้อยแล้ว'
          : 'เพิ่มรายการใหม่เรียบร้อยแล้ว',
      });
      resetForm();
      await loadAllAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    if (newResetPassword.length < 6) {
      setFeedback({
        type: 'error',
        message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร',
      });
      return;
    }

    setIsResettingPwd(true);
    try {
      await adminResetUserPassword(resetTargetUser.id, newResetPassword);
      setFeedback({
        type: 'success',
        message: `รีเซ็ตรหัสผ่านของบัญชี "${resetTargetUser.username}" (${resetTargetUser.display_name}) เรียบร้อยแล้ว`,
      });
      setResetTargetUser(null);
      setNewResetPassword('');
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'ไม่สามารถรีเซ็ตรหัสผ่านได้',
      });
    } finally {
      setIsResettingPwd(false);
    }
  };

  const tabs: { id: AdminTab; label: string; count: number; icon: React.ReactNode }[] = [
    {
      id: 'buildings',
      label: 'อาคาร',
      count: buildings.length,
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: 'floors',
      label: 'ชั้น',
      count: floors.length,
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'rooms',
      label: 'ห้อง / บริเวณ',
      count: rooms.length,
      icon: <DoorOpen className="w-4 h-4" />,
    },
    {
      id: 'categories',
      label: 'หมวดหมู่หลัก',
      count: categories.length,
      icon: <Tag className="w-4 h-4" />,
    },
    {
      id: 'subcategories',
      label: 'หมวดหมู่ย่อย / อุปกรณ์',
      count: subcategories.length,
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'reporter_types',
      label: 'ประเภทผู้แจ้ง',
      count: reporterTypes.length,
      icon: <UserCheck className="w-4 h-4" />,
    },
    {
      id: 'technicians',
      label: 'รายชื่อช่าง (Master)',
      count: technicians.length,
      icon: <Wrench className="w-4 h-4" />,
    },
    {
      id: 'users',
      label: 'บัญชีผู้ใช้หลังบ้าน',
      count: users.length,
      icon: <Users className="w-4 h-4" />,
    },
  ];

  // Filtered views for Floors & Rooms tables
  const filteredFloors = useMemo(() => {
    if (filterBuildingId <= 0) return floors;
    return floors.filter((fl) => fl.building_id === filterBuildingId);
  }, [floors, filterBuildingId]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (filterBuildingId > 0 && r.building_id !== filterBuildingId) return false;
      if (filterFloorId > 0 && r.floor_id !== filterFloorId) return false;
      return true;
    });
  }, [rooms, filterBuildingId, filterFloorId]);

  const filteredSubcategories = useMemo(() => {
    if (filterCategoryId <= 0) return subcategories;
    return subcategories.filter((sc) => sc.category_id === filterCategoryId);
  }, [subcategories, filterCategoryId]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F3F5FA] flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-[#2F6BFF]" />
            จัดการข้อมูลหลักและบัญชีผู้ใช้งาน (Admin Master Data)
          </h1>
          <p className="text-xs sm:text-sm text-[#9BA3B8] mt-0.5">
            บริหารโครงสร้างสถานที่ 3 ระดับ หมวดหมู่งานซ่อม ประเภทผู้แจ้ง รายชื่อช่างปฏิบัติงาน
            และบัญชีล็อกอินหลังบ้าน
          </p>
        </div>

        <button
          type="button"
          onClick={loadAllAdminData}
          className="emms-btn-secondary text-xs self-start sm:self-center"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabSwitch(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
                isSelected
                  ? 'bg-[#2F6BFF] text-white border-[#2F6BFF] shadow-sm'
                  : 'bg-[#121420] text-[#9BA3B8] border-[#1E2235] hover:text-[#F3F5FA]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-[#090A10] text-[#9BA3B8]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-xl p-3.5 text-xs font-medium flex items-center justify-between gap-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
              : 'bg-[#FF7A1A]/15 border-[#FF7A1A] text-[#FF984D]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#FF7A1A] shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Layout: Left Form (1/3) + Right Table (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Form Card */}
        <form
          onSubmit={handleSaveSubmit}
          className="emms-card p-5 space-y-4 lg:sticky lg:top-20"
        >
          <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
            <h2 className="text-sm font-extrabold text-[#F3F5FA] flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit3 className="w-4 h-4 text-[#FF984D]" />
                  <span>แก้ไขข้อมูล (ID #{editingId})</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-[#2F6BFF]" />
                  <span>
                    เพิ่ม{tabs.find((t) => t.id === activeTab)?.label}ใหม่
                  </span>
                </>
              )}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-[#5A8BFF] hover:underline"
              >
                ยกเลิกแก้ไข
              </button>
            )}
          </div>

          {/* Dynamic Fields by Active Tab */}
          {activeTab === 'buildings' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  รหัสอาคาร (เช่น BLD-A)
                </label>
                <input
                  type="text"
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="เช่น BLD-A"
                  className="emms-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่ออาคาร <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น อาคารอำนวยการกลาง"
                  className="emms-input text-xs"
                  required
                />
              </div>
            </>
          )}

          {activeTab === 'floors' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  สังกัดอาคาร <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={fBuildingId}
                  onChange={(e) => setFBuildingId(Number(e.target.value))}
                  className="emms-select text-xs"
                  required
                >
                  <option value={0}>-- เลือกอาคาร --</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อชั้น <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น ชั้น 1, ชั้น 2, ชั้นใต้ดิน"
                  className="emms-input text-xs"
                  required
                />
              </div>
            </>
          )}

          {activeTab === 'rooms' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  เลือกอาคาร <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={fBuildingId}
                  onChange={(e) => {
                    const bId = Number(e.target.value);
                    setFBuildingId(bId);
                    const firstFloor = floors.find((fl) => fl.building_id === bId);
                    setFFloorId(firstFloor ? firstFloor.id : 0);
                  }}
                  className="emms-select text-xs"
                  required
                >
                  <option value={0}>-- เลือกอาคาร --</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  เลือกชั้น <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={fFloorId}
                  onChange={(e) => setFFloorId(Number(e.target.value))}
                  className="emms-select text-xs"
                  required
                >
                  <option value={0}>-- เลือกชั้น --</option>
                  {formAvailableFloors.map((fl) => (
                    <option key={fl.id} value={fl.id}>
                      {fl.building_name ? `${fl.building_name} - ` : ''}
                      {fl.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  รหัสห้อง (ไม่บังคับ เช่น A-101)
                </label>
                <input
                  type="text"
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="เช่น A-101"
                  className="emms-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อห้อง / บริเวณ <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น ห้องประชุมใหญ่ 101, ห้องน้ำชายชั้น 1"
                  className="emms-input text-xs"
                  required
                />
              </div>
            </>
          )}

          {activeTab === 'categories' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  รหัสหมวดหมู่หลัก (เช่น ELEC, AIR)
                </label>
                <input
                  type="text"
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="เช่น ELEC"
                  className="emms-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อหมวดหมู่งานซ่อมหลัก <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น ระบบไฟฟ้าและแสงสว่าง"
                  className="emms-input text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  คำอธิบายตัวอย่างอาการ
                </label>
                <textarea
                  rows={2}
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  placeholder="เช่น หลอดไฟเสีย, ปลั๊กไฟชำรุด, เบรกเกอร์ทริป"
                  className="emms-input text-xs"
                />
              </div>
            </>
          )}

          {activeTab === 'subcategories' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  สังกัดหมวดหมู่หลัก <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={fCategoryId}
                  onChange={(e) => setFCategoryId(Number(e.target.value))}
                  className="emms-select text-xs"
                  required
                >
                  <option value={0}>-- เลือกหมวดหมู่หลัก --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  รหัสหมวดหมู่ย่อย (ไม่บังคับ เช่น ELEC-BULB)
                </label>
                <input
                  type="text"
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="เช่น ELEC-BULB"
                  className="emms-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อหมวดหมู่ย่อย / รายการอุปกรณ์ <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น หลอดไฟ / โคมไฟ, ปลั๊กไฟ / เต้ารับ, สวิตช์ไฟ"
                  className="emms-input text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  คำอธิบายตัวอย่างอาการย่อย
                </label>
                <textarea
                  rows={2}
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  placeholder="เช่น หลอดไฟดับ, หลอดไฟกะพริบ, โคมไฟชำรุด"
                  className="emms-input text-xs"
                />
              </div>
            </>
          )}

          {activeTab === 'reporter_types' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  รหัสประเภทผู้แจ้ง (เช่น STAFF, STUDENT)
                </label>
                <input
                  type="text"
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="เช่น STAFF"
                  className="emms-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อประเภทผู้แจ้งซ่อม (Zero PII) <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น เจ้าหน้าที่, นักศึกษา, แม่บ้าน, รปภ."
                  className="emms-input text-xs"
                  required
                />
              </div>
            </>
          )}

          {activeTab === 'technicians' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อ-นามสกุลช่างปฏิบัติงาน <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น นายสมชาย ใจดี"
                  className="emms-input text-xs"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                    ชื่อเล่น / ชื่อเรียก
                  </label>
                  <input
                    type="text"
                    value={fNickname}
                    onChange={(e) => setFNickname(e.target.value)}
                    placeholder="เช่น ช่างชาย"
                    className="emms-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                    เบอร์ติดต่อภายใน
                  </label>
                  <input
                    type="text"
                    value={fPhone}
                    onChange={(e) => setFPhone(e.target.value)}
                    placeholder="เช่น ต่อ 1101"
                    className="emms-input text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ความเชี่ยวชาญหลัก
                </label>
                <input
                  type="text"
                  value={fSpecialty}
                  onChange={(e) => setFSpecialty(e.target.value)}
                  placeholder="เช่น ระบบไฟฟ้า / เครื่องปรับอากาศ"
                  className="emms-input text-xs"
                />
              </div>
            </>
          )}

          {activeTab === 'users' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อผู้ใช้สำหรับล็อกอิน (Username) <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fUsername}
                  onChange={(e) => setFUsername(e.target.value)}
                  placeholder="เช่น tech02 หรือ reporter01"
                  className="emms-input text-xs font-mono"
                  required
                />
              </div>
              {!editingId && (
                <div>
                  <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                    รหัสผ่านเริ่มต้น (อย่างน้อย 6 ตัวอักษร){' '}
                    <span className="text-[#FF7A1A]">*</span>
                  </label>
                  <input
                    type="password"
                    value={fPassword}
                    onChange={(e) => setFPassword(e.target.value)}
                    placeholder="ตั้งรหัสผ่านให้ผู้ใช้งาน"
                    minLength={6}
                    className="emms-input text-xs"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  ชื่อที่แสดงในระบบ (Display Name) <span className="text-[#FF7A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={fDisplayName}
                  onChange={(e) => setFDisplayName(e.target.value)}
                  placeholder="เช่น ทีมช่างซ่อมบำรุง / ผู้บริหาร"
                  className="emms-input text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                  บทบาทสิทธิ์การใช้งาน (Role) <span className="text-[#FF7A1A]">*</span>
                </label>
                <select
                  value={fRole}
                  onChange={(e) => setFRole(e.target.value as StaffRole)}
                  className="emms-select text-xs"
                >
                  <option value="technician">{ROLE_LABELS.technician}</option>
                  <option value="reporter">{ROLE_LABELS.reporter}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                </select>
              </div>
            </>
          )}

          {/* Common SortOrder & IsActive */}
          {activeTab !== 'users' && (
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8] mb-1">
                ลำดับการแสดงผล (Sort Order — เลขน้อยแสดงก่อน)
              </label>
              <input
                type="number"
                value={fSortOrder}
                onChange={(e) => setFSortOrder(Number(e.target.value))}
                className="emms-input text-xs"
              />
            </div>
          )}

          <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fIsActive}
              onChange={(e) => setFIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-[#1E2235] text-[#2F6BFF] focus:ring-[#2F6BFF]"
            />
            <span className="text-xs font-semibold text-[#F3F5FA]">
              เปิดใช้งานรายการนี้ (Active)
            </span>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="emms-btn-primary w-full text-xs py-2.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่มข้อมูล'}</span>
              </>
            )}
          </button>
        </form>

        {/* Data Table Card */}
        <div className="emms-card p-5 lg:col-span-2 space-y-4">
          {/* Sub-Filters for Floors, Rooms & Subcategories */}
          {(activeTab === 'floors' || activeTab === 'rooms') && (
            <div className="flex items-center gap-3 flex-wrap pb-3 border-b border-[#1E2235]">
              <select
                value={filterBuildingId}
                onChange={(e) => {
                  setFilterBuildingId(Number(e.target.value));
                  setFilterFloorId(0);
                }}
                className="emms-select text-xs py-1.5 w-auto"
              >
                <option value={0}>กรอง: ทุกอาคาร</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              {activeTab === 'rooms' && (
                <select
                  value={filterFloorId}
                  onChange={(e) => setFilterFloorId(Number(e.target.value))}
                  className="emms-select text-xs py-1.5 w-auto"
                >
                  <option value={0}>กรอง: ทุกชั้น</option>
                  {filteredFloors.map((fl) => (
                    <option key={fl.id} value={fl.id}>
                      {fl.building_name ? `${fl.building_name} - ` : ''}
                      {fl.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {activeTab === 'subcategories' && (
            <div className="flex items-center gap-3 flex-wrap pb-3 border-b border-[#1E2235]">
              <select
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(Number(e.target.value))}
                className="emms-select text-xs py-1.5 w-auto"
              >
                <option value={0}>กรอง: ทุกหมวดหมู่หลัก ({subcategories.length} รายการย่อย)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#9BA3B8]">
              <Loader2 className="w-6 h-6 text-[#2F6BFF] animate-spin" />
              <span className="text-xs">กำลังโหลดตารางข้อมูล...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* 1. Buildings Table */}
              {activeTab === 'buildings' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">รหัส</th>
                      <th className="py-2.5 px-3 text-left">ชื่ออาคาร</th>
                      <th className="py-2.5 px-2 text-center">ลำดับ</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {buildings.map((item) => (
                      <tr key={item.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-mono text-[#5A8BFF]">
                          {item.code || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-2 text-center">{item.sort_order}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setFCode(item.code || '');
                              setFName(item.name);
                              setFSortOrder(item.sort_order);
                              setFIsActive(item.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 2. Floors Table */}
              {activeTab === 'floors' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">อาคาร</th>
                      <th className="py-2.5 px-3 text-left">ชื่อชั้น</th>
                      <th className="py-2.5 px-2 text-center">ลำดับ</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {filteredFloors.map((item) => (
                      <tr key={item.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 text-[#9BA3B8]">
                          {item.building_name || `อาคาร #${item.building_id}`}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-2 text-center">{item.sort_order}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setFBuildingId(item.building_id);
                              setFName(item.name);
                              setFSortOrder(item.sort_order);
                              setFIsActive(item.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 3. Rooms Table */}
              {activeTab === 'rooms' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">รหัสห้อง</th>
                      <th className="py-2.5 px-3 text-left">ชื่อห้อง / บริเวณ</th>
                      <th className="py-2.5 px-3 text-left">อาคาร / ชั้น</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {filteredRooms.map((item) => (
                      <tr key={item.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-mono text-[#5A8BFF]">
                          {item.code || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-3 text-[#9BA3B8]">
                          {item.building_name} • {item.floor_name}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setFBuildingId(item.building_id || 0);
                              setFFloorId(item.floor_id);
                              setFCode(item.code || '');
                              setFName(item.name);
                              setFSortOrder(item.sort_order);
                              setFIsActive(item.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 4. Categories Table */}
              {activeTab === 'categories' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">รหัส</th>
                      <th className="py-2.5 px-3 text-left">ชื่อหมวดหมู่หลัก</th>
                      <th className="py-2.5 px-3 text-left">คำอธิบาย</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {categories.map((item) => (
                      <tr key={item.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-mono text-[#5A8BFF]">
                          {item.code || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-3 text-[#9BA3B8]">
                          {item.description || '-'}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setFCode(item.code || '');
                              setFName(item.name);
                              setFDescription(item.description || '');
                              setFSortOrder(item.sort_order);
                              setFIsActive(item.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 4.1 Subcategories Table */}
              {activeTab === 'subcategories' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">หมวดหมู่หลัก</th>
                      <th className="py-2.5 px-3 text-left">ชื่อหมวดหมู่ย่อย / อุปกรณ์</th>
                      <th className="py-2.5 px-3 text-left">ตัวอย่างอาการ</th>
                      <th className="py-2.5 px-2 text-center">ลำดับ</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {filteredSubcategories.map((item) => (
                      <tr key={item.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 text-[#5A8BFF] font-medium">
                          {item.category_name || `หมวด #${item.category_id}`}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.name}
                          {item.code && (
                            <span className="ml-1.5 font-mono text-[11px] text-[#9BA3B8]">
                              ({item.code})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[#9BA3B8]">
                          {item.description || '-'}
                        </td>
                        <td className="py-2.5 px-2 text-center">{item.sort_order}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setFCategoryId(item.category_id);
                              setFCode(item.code || '');
                              setFName(item.name);
                              setFDescription(item.description || '');
                              setFSortOrder(item.sort_order);
                              setFIsActive(item.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 5. Reporter Types Table */}
              {activeTab === 'reporter_types' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">รหัส</th>
                      <th className="py-2.5 px-3 text-left">ชื่อประเภทผู้แจ้ง (Zero PII)</th>
                      <th className="py-2.5 px-2 text-center">ลำดับ</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {reporterTypes.map((item) => (
                      <tr key={item.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-mono text-[#5A8BFF]">
                          {item.code || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-2 text-center">{item.sort_order}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setFCode(item.code || '');
                              setFName(item.name);
                              setFSortOrder(item.sort_order);
                              setFIsActive(item.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 6. Technicians Roster Table */}
              {activeTab === 'technicians' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">ชื่อ-นามสกุลช่าง</th>
                      <th className="py-2.5 px-2 text-left">ชื่อเล่น</th>
                      <th className="py-2.5 px-3 text-left">ความเชี่ยวชาญ / เบอร์ติดต่อ</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {technicians.map((item) => (
                      <tr key={item.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {item.full_name}
                        </td>
                        <td className="py-2.5 px-2 text-[#5A8BFF]">
                          {item.nickname || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-[#9BA3B8]">
                          {item.specialty || '-'}
                          {item.phone ? ` (${item.phone})` : ''}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              item.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {item.is_active ? 'ปฏิบัติงาน' : 'พักงาน/ปิด'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setFName(item.full_name);
                              setFNickname(item.nickname || '');
                              setFSpecialty(item.specialty || '');
                              setFPhone(item.phone || '');
                              setFSortOrder(item.sort_order);
                              setFIsActive(item.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 7. Staff Users Table */}
              {activeTab === 'users' && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2235] text-[#9BA3B8]">
                      <th className="py-2.5 px-3 text-left">Username</th>
                      <th className="py-2.5 px-3 text-left">ชื่อที่แสดง</th>
                      <th className="py-2.5 px-3 text-left">บทบาท (Role)</th>
                      <th className="py-2.5 px-2 text-center">สถานะ</th>
                      <th className="py-2.5 px-2 text-left">เข้าใช้ล่าสุด</th>
                      <th className="py-2.5 px-3 text-right">จัดการ / รีเซ็ตรหัส</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2235]">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#171A29]">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#5A8BFF]">
                          {u.username}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#F3F5FA]">
                          {u.display_name}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2F6BFF]/15 text-[#5A8BFF] border border-[#2F6BFF]/30 text-[11px] font-semibold">
                            <Shield className="w-3 h-3" />
                            {u.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              u.is_active
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {u.is_active ? 'ปกติ' : 'ระงับ'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-[#9BA3B8]">
                          {formatThaiDateTime(u.last_login_at)}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(u.id);
                              setFUsername(u.username);
                              setFDisplayName(u.display_name);
                              setFRole(u.role);
                              setFIsActive(u.is_active);
                            }}
                            className="inline-flex items-center gap-1 text-[#5A8BFF] hover:underline font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResetTargetUser(u);
                              setNewResetPassword('');
                            }}
                            className="inline-flex items-center gap-1 text-[#FF984D] hover:underline font-semibold"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            รีเซ็ตรหัสผ่าน
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetTargetUser && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setResetTargetUser(null)}
        >
          <div
            className="emms-card p-6 max-w-md w-full space-y-4 border-[#FF7A1A]/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
              <h3 className="text-base font-extrabold text-[#F3F5FA] flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#FF7A1A]" />
                รีเซ็ตรหัสผ่านผู้ใช้งาน
              </h3>
              <button
                type="button"
                onClick={() => setResetTargetUser(null)}
                className="p-1 text-[#9BA3B8] hover:text-[#F3F5FA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#9BA3B8]">
              กำหนดรหัสผ่านใหม่ให้บัญชี{' '}
              <strong className="text-[#5A8BFF] font-mono">
                {resetTargetUser.username}
              </strong>{' '}
              ({resetTargetUser.display_name})
            </p>

            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8] mb-1.5">
                  รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)
                </label>
                <input
                  type="password"
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่..."
                  minLength={6}
                  className="emms-input text-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="emms-btn-secondary text-xs px-4 py-2"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isResettingPwd}
                  className="emms-btn-accent text-xs px-4 py-2"
                >
                  {isResettingPwd ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  <span>ยืนยันรีเซ็ตรหัสผ่าน</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
