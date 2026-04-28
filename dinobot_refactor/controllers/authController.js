const bcrypt = require('bcryptjs');
const { supabase } = require('../db');
const { createAccessToken } = require('../utils/token');

async function login(req, res) {
  try {
    const { employeeId, employee_id, id, password } = req.body;
    const userId = employeeId || employee_id || id;

    const { data: rows, error } = await supabase
      .from('users')
      .select('*')
      .eq('employee_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = rows[0];

    // Check if account has been disabled by manager
    if (user.is_disabled) {
      return res.status(403).json({ success: false, error: 'Account has been disabled. Contact your manager.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update last_login timestamp
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    const accessToken = createAccessToken(user);

    return res.json({
      success: true,
      message: 'Login successful',
      accessToken,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        role: user.role,
        fullName: user.full_name,
        station: user.station
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

function logout(req, res) {
  return res.json({ success: true, message: 'Logged out successfully' });
}

function me(req, res) {
  return res.json({ success: true, user: req.user });
}

// ── STAFF MANAGEMENT ─────────────────────────────────────────

async function registerStaff(req, res) {
  try {
    const { fullName, employeeId, password, role } = req.body;

    if (!fullName || !employeeId || !password) {
      return res.status(400).json({ success: false, error: 'fullName, employeeId, and password are required' });
    }

    // Only allow kitchen role via this endpoint
    const assignedRole = role === 'kitchen' ? 'kitchen' : 'kitchen';

    // Check if employeeId already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('employee_id', employeeId)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Employee ID already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { data, error } = await supabase
      .from('users')
      .insert([{
        full_name:     fullName,
        employee_id:   employeeId,
        password_hash,
        role:          assignedRole,
        is_active:     true,
        is_disabled:   false,
        orders_handled: 0,
        created_at:    new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Staff account created',
      user: {
        id:         data.id,
        employeeId: data.employee_id,
        fullName:   data.full_name,
        role:       data.role
      }
    });
  } catch (err) {
    console.error('Register staff error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

async function getStaff(req, res) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, employee_id, role, is_active, is_disabled, last_login, orders_handled, created_at')
      .eq('role', 'kitchen')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({ success: true, staff: data || [] });
  } catch (err) {
    console.error('Get staff error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

async function updateStaffStatus(req, res) {
  try {
    const { id } = req.params;
    const { disabled } = req.body;

    if (typeof disabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'disabled must be a boolean' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ is_disabled: disabled })
      .eq('id', id)
      .eq('role', 'kitchen')   // can only disable kitchen staff, not other managers
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Staff member not found' });

    return res.json({
      success: true,
      message: disabled ? 'Account disabled' : 'Account enabled',
      user: { id: data.id, employeeId: data.employee_id, is_disabled: data.is_disabled }
    });
  } catch (err) {
    console.error('Update staff status error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

async function deleteStaff(req, res) {
  try {
    const { id } = req.params;

    // Prevent deleting manager accounts through this route
    const { data: target } = await supabase
      .from('users')
      .select('role, full_name')
      .eq('id', id)
      .single();

    if (!target) return res.status(404).json({ success: false, error: 'Staff member not found' });
    if (target.role === 'manager') {
      return res.status(403).json({ success: false, error: 'Cannot delete manager accounts' });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.json({ success: true, message: 'Staff account deleted', name: target.full_name });
  } catch (err) {
    console.error('Delete staff error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

module.exports = { login, logout, me, registerStaff, getStaff, updateStaffStatus, deleteStaff };